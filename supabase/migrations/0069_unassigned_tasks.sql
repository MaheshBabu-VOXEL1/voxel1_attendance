-- Managers can save tasks during the day without a person or due date, and
-- assign them later. An unassigned task is visible only to the manager who
-- created it; employees see a task only once it is assigned to them.
begin;

alter table public.assigned_tasks alter column employee_id drop not null;
alter table public.assigned_tasks alter column employee_name drop not null;

drop policy if exists assigned_tasks_read on public.assigned_tasks;
create policy assigned_tasks_read on public.assigned_tasks for select to authenticated using (
 organization_id = public.auth_org_id() and
 (employee_id = auth.uid() or assigned_by = auth.uid()
   or (public.auth_role() = 'ADMIN' and employee_id is not null))
);

-- Due date is optional when assigning.
create or replace function public.assign_employee_task(p_employee_id uuid, p_description text, p_project_name text, p_due_date date, p_status text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare result public.assigned_tasks;
begin
  if p_status is null or p_status not in ('NOT_STARTED','START','PROGRESS','END') then
    raise exception 'Choose a valid task status';
  end if;
  -- Existing function enforces active role and organization access.
  result := public.assign_employee_task(p_employee_id, p_description, p_project_name);
  update public.assigned_tasks set due_date = p_due_date, status = p_status,
    started_at = case when p_status <> 'NOT_STARTED' then now() else null end,
    completed_at = case when p_status = 'END' then now() else null end
  where id = result.id returning * into result;
  return result;
end;
$$;

create function public.create_unassigned_task(p_description text, p_project_name text, p_due_date date default null)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; result public.assigned_tasks;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
    raise exception 'Only active managers and admins can add tasks' using errcode = '42501';
  end if;
  if p_project_name is null or length(trim(p_project_name)) not between 1 and 200 then
    raise exception 'Enter a project name between 1 and 200 characters';
  end if;
  if p_description is null or length(trim(p_description)) not between 1 and 4000 then
    raise exception 'Enter a task between 1 and 4000 characters';
  end if;
  insert into public.assigned_tasks(organization_id, employee_id, assigned_by, employee_name, manager_name, description, project_name, due_date)
  values(actor.organization_id, null, actor.id, null, coalesce(actor.name,'Manager'), trim(p_description), trim(p_project_name), p_due_date)
  returning * into result;
  return result;
end;
$$;

create function public.assign_unassigned_task(p_task_id uuid, p_employee_id uuid, p_due_date date default null)
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
    or employee.organization_id is distinct from actor.organization_id then
    raise exception 'Choose an active employee from your organization' using errcode = '42501';
  end if;
  update public.assigned_tasks t
  set employee_id = employee.id, employee_name = coalesce(employee.name,'Employee'),
      due_date = coalesce(p_due_date, t.due_date), updated = now()
  where t.id = p_task_id and t.employee_id is null and t.assigned_by = actor.id
    and t.organization_id = actor.organization_id
  returning t.* into result;
  if not found then
    raise exception 'This task is already assigned or was added by another manager' using errcode = '42501';
  end if;
  return result;
end;
$$;

revoke all on function public.create_unassigned_task(text,text,date) from public, anon;
grant execute on function public.create_unassigned_task(text,text,date) to authenticated;
revoke all on function public.assign_unassigned_task(uuid,uuid,date) from public, anon;
grant execute on function public.assign_unassigned_task(uuid,uuid,date) to authenticated;

commit;
notify pgrst, 'reload schema';
