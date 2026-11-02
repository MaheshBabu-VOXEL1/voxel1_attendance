begin;

-- Tokens are private. Registration transfers a shared phone to its current account.
create table public.mobile_push_tokens (
 token text primary key check(length(token) between 20 and 4096),
 user_id uuid not null references public.profiles(id) on delete cascade,
 updated_at timestamptz not null default now()
);
alter table public.mobile_push_tokens enable row level security;
revoke all on public.mobile_push_tokens from anon, authenticated;
grant all on public.mobile_push_tokens to service_role;
create function public.register_mobile_push(p_token text) returns void
language plpgsql security definer set search_path = public as $$
begin
 if not exists(select 1 from profiles where id = auth.uid() and status <> 'INACTIVE') then
   raise exception 'Active account required';
 end if;
 insert into mobile_push_tokens(token,user_id) values(p_token,auth.uid())
 on conflict(token) do update set user_id = auth.uid(), updated_at = now();
end $$;
create function public.unregister_mobile_push(p_token text) returns void
language sql security definer set search_path = public as $$
 delete from mobile_push_tokens where token = p_token and user_id = auth.uid();
$$;
revoke all on function public.register_mobile_push(text), public.unregister_mobile_push(text) from public, anon;
grant execute on function public.register_mobile_push(text), public.unregister_mobile_push(text) to authenticated;

-- Durable per-device delivery. No backlog is sent to devices registered later.
create table public.mobile_push_queue (
 id bigint generated always as identity primary key,
 notification_id uuid not null references public.notifications(id) on delete cascade,
 token text not null references public.mobile_push_tokens(token) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 unique(notification_id,token)
);
alter table public.mobile_push_queue enable row level security;
revoke all on public.mobile_push_queue from anon, authenticated;
grant all on public.mobile_push_queue to service_role;
grant usage, select on sequence public.mobile_push_queue_id_seq to service_role;
create function public.enqueue_mobile_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
 insert into mobile_push_queue(notification_id,token,user_id)
 select new.id,t.token,new.user_id from mobile_push_tokens t where t.user_id = new.user_id;
 return new;
end $$;
create trigger notifications_mobile_push after insert on public.notifications
 for each row execute function public.enqueue_mobile_push();

create function public.claim_mobile_push() returns setof public.mobile_push_queue
language sql security definer set search_path = public as $$
 update mobile_push_queue q set attempts = attempts + 1, available_at = now() + interval '5 minutes'
 where id in (select id from mobile_push_queue where available_at <= now() and attempts < 8
 order by id for update skip locked limit 50) returning q.*;
$$;
revoke all on function public.claim_mobile_push() from public, anon, authenticated;
grant execute on function public.claim_mobile_push() to service_role;

-- All active managers in the organization receive the activity feed requested.
create function public.notify_activity_managers(p_org uuid,p_title text,p_message text,p_reference text,p_type text)
returns void language sql security definer set search_path = public as $$
 insert into notifications(organization_id,user_id,type,title,message,reference_id,reference_type,action_url)
 select p_org,id,p_type,p_title,p_message,p_reference,lower(p_type),'dashboard'
 from profiles where organization_id = p_org and role in ('MANAGER','ADMIN') and status <> 'INACTIVE';
$$;
revoke all on function public.notify_activity_managers(uuid,text,text,text,text) from public, anon, authenticated;

create function public.task_activity_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare title_text text; message_text text;
begin
 if new.employee_id is null then return new; end if;
 if tg_op = 'INSERT' then
   title_text := case when new.self_created then 'Employee created a task' else 'Task assigned' end;
   message_text := case when new.self_created then new.employee_name || ' created a task: '
     else new.manager_name || ' assigned a task to ' || new.employee_name || ': ' end || left(new.description,300);
 elsif new.employee_id is distinct from old.employee_id then
   title_text := 'Task reassigned';
   message_text := new.manager_name || ' assigned a task to ' || new.employee_name || ': ' || left(new.description,300);
 elsif new.status is distinct from old.status then
   title_text := 'Task ' || case new.status when 'START' then 'started' when 'PROGRESS' then 'in progress'
     when 'STUCK' then 'stuck' when 'END' then 'done' else 'updated' end;
   message_text := new.employee_name || ': ' || title_text || ' — ' || left(new.description,300);
 else return new;
 end if;
 perform notify_activity_managers(new.organization_id,title_text,message_text,new.id::text,'TASK');
 if (tg_op = 'INSERT' and not new.self_created) or
    (tg_op = 'UPDATE' and new.employee_id is distinct from old.employee_id) then
   insert into notifications(organization_id,user_id,type,title,message,reference_id,reference_type,action_url)
   values(new.organization_id,new.employee_id,'TASK',title_text,message_text,new.id::text,'task','dashboard');
 end if;
 return new;
end $$;
create trigger assigned_tasks_activity_notify after insert or update on public.assigned_tasks
 for each row execute function public.task_activity_notify();

create function public.task_comment_activity_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.assigned_tasks;
begin
 select * into t from assigned_tasks where id = new.task_id;
 perform notify_activity_managers(t.organization_id,'Task comment',
   new.author_name || ' commented on ' || left(t.description,120) || ': ' || left(new.body,300),t.id::text,'TASK');
 return new;
end $$;
create trigger task_comments_activity_notify after insert on public.task_comments
 for each row execute function public.task_comment_activity_notify();

create function public.attendance_activity_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare employee text; event_text text;
begin
 if tg_op = 'INSERT' and new.check_in is not null then event_text := 'checked in';
 elsif tg_op = 'UPDATE' and old.check_in is null and new.check_in is not null then event_text := 'checked in';
 elsif tg_op = 'UPDATE' and old.check_out is null and new.check_out is not null then event_text := 'checked out';
 else return new;
 end if;
 select name into employee from profiles where id = public.try_uuid(new.employee_id) and organization_id = new.organization_id;
 perform notify_activity_managers(new.organization_id,'Employee ' || event_text,
   coalesce(employee,'Employee') || ' ' || event_text || '.',new.id::text,'ATTENDANCE');
 return new;
end $$;
create trigger attendance_activity_notify after insert or update on public.attendance
 for each row execute function public.attendance_activity_notify();
commit;
