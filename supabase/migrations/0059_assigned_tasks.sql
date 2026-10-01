-- Manager-assigned tasks; employees can change only their own task status.
create table public.assigned_tasks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 employee_id uuid not null references public.profiles(id) on delete cascade,
 assigned_by uuid not null references public.profiles(id),
 employee_name text not null,
 manager_name text not null,
 description text not null check(length(trim(description)) between 1 and 4000),
 status text not null default 'NOT_STARTED' check(status in ('NOT_STARTED','START','PROGRESS','END')),
 created timestamptz not null default now(),
 updated timestamptz not null default now(),
 completed_at timestamptz
);
create index assigned_tasks_employee on public.assigned_tasks(employee_id, created desc);
create index assigned_tasks_manager on public.assigned_tasks(assigned_by, created desc);
alter table public.assigned_tasks enable row level security;
revoke all on public.assigned_tasks from anon, authenticated;
grant select on public.assigned_tasks to authenticated;
grant all on public.assigned_tasks to service_role;
create policy assigned_tasks_read on public.assigned_tasks for select to authenticated using (
 organization_id = public.auth_org_id() and
 (employee_id = auth.uid() or assigned_by = auth.uid() or public.auth_role() = 'ADMIN')
);

create function public.assign_employee_task(p_employee_id uuid, p_description text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; employee public.profiles; result public.assigned_tasks;
begin
 select * into actor from public.profiles where id = auth.uid();
 if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
   raise exception 'Only active managers and admins can assign tasks' using errcode = '42501';
 end if;
 select * into employee from public.profiles where id = p_employee_id;
 if employee.id is null or employee.role <> 'EMPLOYEE' or employee.status = 'INACTIVE'
   or employee.organization_id is distinct from actor.organization_id
   or (actor.role = 'MANAGER' and employee.line_manager_id is distinct from actor.id) then
   raise exception 'Choose an active employee from your team' using errcode = '42501';
 end if;
 if p_description is null or length(trim(p_description)) not between 1 and 4000 then
   raise exception 'Enter a task between 1 and 4000 characters';
 end if;
 insert into public.assigned_tasks(organization_id, employee_id, assigned_by, employee_name, manager_name, description)
 values(actor.organization_id, employee.id, actor.id, coalesce(employee.name,'Employee'), coalesce(actor.name,'Manager'), trim(p_description))
 returning * into result;
 return result;
end;
$$;

create function public.set_assigned_task_status(p_task_id uuid, p_status text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare result public.assigned_tasks;
begin
 if p_status is null or p_status not in ('START','PROGRESS','END') then
   raise exception 'Choose Start, Progress, or End';
 end if;
 update public.assigned_tasks t
 set status = p_status, updated = now(),
 completed_at = case when p_status = 'END' then coalesce(t.completed_at, now()) else null end
 where t.id = p_task_id and t.employee_id = auth.uid()
 and exists(select 1 from public.profiles p where p.id = auth.uid()
   and p.role = 'EMPLOYEE' and p.status <> 'INACTIVE' and p.organization_id = t.organization_id)
 returning t.* into result;
 if not found then raise exception 'You can update only your assigned tasks' using errcode = '42501'; end if;
 return result;
end;
$$;
revoke all on function public.assign_employee_task(uuid,text) from public, anon;
revoke all on function public.set_assigned_task_status(uuid,text) from public, anon;
grant execute on function public.assign_employee_task(uuid,text) to authenticated;
grant execute on function public.set_assigned_task_status(uuid,text) to authenticated;
-- Retain past reports, but the new workflow does not accept employee-written reports.
revoke insert, update on public.daily_tasks from authenticated;

