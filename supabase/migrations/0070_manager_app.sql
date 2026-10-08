-- Manager app (Tasks / Leaves / Calendar):
--  * a fifth task status, STUCK (blocked, needs help);
--  * managers edit and delete the tasks they created (text, project, person, due date, status);
--  * calendar events, and manager-added holidays written to the shared holiday list.
begin;

-- ---------- STUCK status ----------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.assigned_tasks'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%status%NOT_STARTED%' loop
    execute format('alter table public.assigned_tasks drop constraint %I', c);
  end loop;
end $$;
alter table public.assigned_tasks add constraint assigned_tasks_status_check
  check (status in ('NOT_STARTED','START','PROGRESS','STUCK','END'));

create or replace function public.set_assigned_task_status(p_task_id uuid, p_status text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare result public.assigned_tasks;
begin
 if p_status is null or p_status not in ('NOT_STARTED','START','PROGRESS','STUCK','END') then
   raise exception 'Choose Not started, Start, Progress, Stuck, or End';
 end if;
 update public.assigned_tasks t
 set status = p_status, updated = now(),
 started_at = case when p_status = 'START' then coalesce(t.started_at, now()) else t.started_at end,
 completed_at = case when p_status = 'END' then coalesce(t.completed_at, now()) else null end
 where t.id = p_task_id and t.employee_id = auth.uid()
 and exists(select 1 from public.profiles p where p.id = auth.uid()
   and p.role = 'EMPLOYEE' and p.status <> 'INACTIVE' and p.organization_id = t.organization_id)
 returning t.* into result;
 if not found then raise exception 'You can update only your assigned tasks' using errcode = '42501'; end if;
 return result;
end;
$$;

create or replace function public.assign_employee_task(p_employee_id uuid, p_description text, p_project_name text, p_due_date date, p_status text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare result public.assigned_tasks;
begin
  if p_status is null or p_status not in ('NOT_STARTED','START','PROGRESS','STUCK','END') then
    raise exception 'Choose a valid task status';
  end if;
  result := public.assign_employee_task(p_employee_id, p_description, p_project_name);
  update public.assigned_tasks set due_date = p_due_date, status = p_status,
    started_at = case when p_status <> 'NOT_STARTED' then now() else null end,
    completed_at = case when p_status = 'END' then now() else null end
  where id = result.id returning * into result;
  return result;
end;
$$;

-- ---------- manager edits / deletes their own tasks ----------
create function public.manager_update_task(p_task_id uuid, p_description text, p_project_name text,
  p_employee_id uuid, p_due_date date, p_status text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; employee public.profiles; t public.assigned_tasks; result public.assigned_tasks;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
    raise exception 'Only active managers and admins can edit tasks' using errcode = '42501';
  end if;
  select * into t from public.assigned_tasks where id = p_task_id for update;
  if t.id is null or t.organization_id is distinct from actor.organization_id or t.assigned_by <> actor.id or t.self_created then
    raise exception 'You can edit only tasks you created' using errcode = '42501';
  end if;
  if p_description is null or length(trim(p_description)) not between 1 and 4000 then
    raise exception 'Enter a task between 1 and 4000 characters';
  end if;
  if p_project_name is null or length(trim(p_project_name)) not between 1 and 200 then
    raise exception 'Enter a project name between 1 and 200 characters';
  end if;
  if p_status is null or p_status not in ('NOT_STARTED','START','PROGRESS','STUCK','END') then
    raise exception 'Choose a valid task status';
  end if;
  if p_employee_id is not null then
    select * into employee from public.profiles where id = p_employee_id;
    if employee.id is null or employee.role <> 'EMPLOYEE' or employee.status = 'INACTIVE'
      or employee.organization_id is distinct from actor.organization_id then
      raise exception 'Choose an active employee from your organization' using errcode = '42501';
    end if;
  end if;
  update public.assigned_tasks set
    description = trim(p_description),
    project_name = trim(p_project_name),
    employee_id = employee.id,
    employee_name = case when employee.id is null then null else coalesce(employee.name, 'Employee') end,
    due_date = p_due_date,
    status = p_status,
    started_at = case when p_status = 'NOT_STARTED' then null else coalesce(started_at, now()) end,
    completed_at = case when p_status = 'END' then coalesce(completed_at, now()) else null end,
    updated = now()
  where id = t.id returning * into result;
  return result;
end;
$$;

create function public.manager_delete_task(p_task_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
    raise exception 'Only active managers and admins can delete tasks' using errcode = '42501';
  end if;
  delete from public.assigned_tasks
  where id = p_task_id and organization_id = actor.organization_id and assigned_by = actor.id and not self_created;
  if not found then raise exception 'You can delete only tasks you created' using errcode = '42501'; end if;
end;
$$;

-- ---------- calendar events ----------
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  event_date date not null,
  created_by uuid references public.profiles(id) on delete set null,
  created timestamptz not null default now()
);
create index calendar_events_org_date on public.calendar_events(organization_id, event_date);
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon, authenticated;
grant select on public.calendar_events to authenticated;
grant all on public.calendar_events to service_role;
create policy calendar_events_read on public.calendar_events for select to authenticated
  using (organization_id = public.auth_org_id());

create function public.add_calendar_event(p_title text, p_date date)
returns public.calendar_events
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; result public.calendar_events;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
    raise exception 'Only active managers and admins can add events' using errcode = '42501';
  end if;
  if p_title is null or length(trim(p_title)) not between 1 and 200 then raise exception 'Enter a title'; end if;
  if p_date is null then raise exception 'Choose a date'; end if;
  insert into public.calendar_events(organization_id, title, event_date, created_by)
  values (actor.organization_id, trim(p_title), p_date, actor.id) returning * into result;
  return result;
end;
$$;

create function public.delete_calendar_event(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
    raise exception 'Only active managers and admins can remove events' using errcode = '42501';
  end if;
  delete from public.calendar_events where id = p_id and organization_id = actor.organization_id;
  if not found then raise exception 'Event not found'; end if;
end;
$$;

-- ---------- holidays (shared list in settings, so leave day counts stay correct) ----------
create function public.add_org_holiday(p_name text, p_date date)
returns void
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; hol jsonb;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
    raise exception 'Only active managers and admins can add holidays' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 200 then raise exception 'Enter a holiday name'; end if;
  if p_date is null then raise exception 'Choose a date'; end if;
  hol := jsonb_build_object('id', 'h-' || gen_random_uuid(), 'date', p_date::text, 'name', trim(p_name),
                            'isGovernment', false, 'type', 'FESTIVAL');
  update public.settings set value = (coalesce(nullif(value, '')::jsonb, '[]'::jsonb) || jsonb_build_array(hol))::text
  where organization_id = actor.organization_id and key = 'holidays';
  if not found then
    insert into public.settings(organization_id, key, value) values (actor.organization_id, 'holidays', jsonb_build_array(hol)::text);
  end if;
end;
$$;

create function public.delete_org_holiday(p_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; cur jsonb; kept jsonb;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
    raise exception 'Only active managers and admins can remove holidays' using errcode = '42501';
  end if;
  select value::jsonb into cur from public.settings where organization_id = actor.organization_id and key = 'holidays' for update;
  -- Government holidays stay; only company-added ones can be removed here.
  select coalesce(jsonb_agg(h), '[]'::jsonb) into kept from jsonb_array_elements(coalesce(cur, '[]'::jsonb)) h
  where not (h->>'id' = p_id and coalesce((h->>'isGovernment')::boolean, false) = false);
  if jsonb_array_length(kept) = jsonb_array_length(coalesce(cur, '[]'::jsonb)) then
    raise exception 'Holiday not found, or it is a government holiday';
  end if;
  update public.settings set value = kept::text where organization_id = actor.organization_id and key = 'holidays';
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['manager_update_task(uuid,text,text,uuid,date,text)','manager_delete_task(uuid)',
    'add_calendar_event(text,date)','delete_calendar_event(uuid)','add_org_holiday(text,date)','delete_org_holiday(text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;
notify pgrst, 'reload schema';
