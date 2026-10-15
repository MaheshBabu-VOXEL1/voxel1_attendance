-- Keep handover notes on the task so they survive a change of assignee.
begin;

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.assigned_tasks(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  kind text not null check (kind in ('STUCK', 'DONE')),
  body text not null check (length(trim(body)) between 3 and 1000),
  progress smallint check (progress between 0 and 100),
  created_at timestamptz not null default now()
);
create index task_comments_task_created on public.task_comments(task_id, created_at desc, id desc);
alter table public.task_comments enable row level security;
revoke all on public.task_comments from public, anon, authenticated;
grant select on public.task_comments to authenticated;
grant all on public.task_comments to service_role;
create policy task_comments_read on public.task_comments for select to authenticated using (
  exists (select 1 from public.assigned_tasks t where t.id = task_id)
);

-- Existing stuck notes become the first handover entry for those tasks.
insert into public.task_comments(task_id, author_id, author_name, kind, body, progress, created_at)
select t.id, t.employee_id, coalesce(t.employee_name, 'Employee'), 'STUCK',
       trim(t.stuck_reason), t.stuck_progress, coalesce(t.stuck_at, t.updated)
from public.assigned_tasks t
where t.stuck_reason is not null and length(trim(t.stuck_reason)) between 3 and 1000;

create function public.record_task_stuck_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor_name text;
begin
  if new.status = 'STUCK' and new.stuck_reason is not null
     and (old.stuck_at is distinct from new.stuck_at or old.stuck_reason is distinct from new.stuck_reason) then
    select name into actor_name from public.profiles where id = auth.uid();
    insert into public.task_comments(task_id, author_id, author_name, kind, body, progress)
    values (new.id, auth.uid(), coalesce(actor_name, new.employee_name, 'Employee'),
            'STUCK', trim(new.stuck_reason), new.stuck_progress);
  end if;
  return new;
end;
$$;
create trigger assigned_tasks_record_stuck_comment after update on public.assigned_tasks
  for each row execute function public.record_task_stuck_comment();

create function public.complete_assigned_task(p_task_id uuid, p_note text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; result public.assigned_tasks;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('EMPLOYEE', 'MANAGER') or actor.status = 'INACTIVE' then
    raise exception 'Sign in again to complete this task' using errcode = '42501';
  end if;
  if p_note is null or length(trim(p_note)) not between 3 and 1000 then
    raise exception 'Write what you completed (3 to 1000 characters)';
  end if;
  update public.assigned_tasks t
  set status = 'END', updated = now(), completed_at = now()
  where t.id = p_task_id and t.employee_id = actor.id and t.organization_id = actor.organization_id
    and t.status <> 'END'
  returning t.* into result;
  if not found then
    raise exception 'You can complete only an open task assigned to you' using errcode = '42501';
  end if;
  insert into public.task_comments(task_id, author_id, author_name, kind, body)
  values (result.id, actor.id, coalesce(actor.name, 'Employee'), 'DONE', trim(p_note));
  return result;
end;
$$;
revoke all on function public.complete_assigned_task(uuid, text) from public, anon;
grant execute on function public.complete_assigned_task(uuid, text) to authenticated;

commit;
notify pgrst, 'reload schema';
