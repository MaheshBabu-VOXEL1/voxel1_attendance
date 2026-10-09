-- The five account-switch members can be given tasks in either mode, so a
-- member in Manager mode can still be assigned work by another manager.
begin;

create or replace function public.is_mode_switcher(p public.profiles)
returns boolean language sql stable security definer set search_path = public as $$
  select p.id is not null and p.role in ('EMPLOYEE','MANAGER') and p.status <> 'INACTIVE'
    and public.norm_mobile(p.mobile) in
      ('9885229887','7893960331','7989626574','7794862595','8331951390');
$$;
revoke all on function public.is_mode_switcher(public.profiles) from public, anon, authenticated;

create or replace function public.can_switch_account_mode()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select public.is_mode_switcher(p) from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.can_receive_tasks(p public.profiles)
returns boolean language sql stable security definer set search_path = public as $$
  select p.role = 'EMPLOYEE' or public.is_mode_switcher(p);
$$;
revoke all on function public.can_receive_tasks(public.profiles) from public, anon, authenticated;

-- Ids of members who can be assigned tasks while in Manager mode (the Assign list).
create or replace function public.mode_switcher_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
  where p.organization_id = public.auth_org_id() and public.is_mode_switcher(p)
    and exists (select 1 from public.profiles a where a.id = auth.uid() and a.role in ('MANAGER','ADMIN') and a.status <> 'INACTIVE');
$$;
revoke all on function public.mode_switcher_ids() from public, anon;
grant execute on function public.mode_switcher_ids() to authenticated;

create or replace function public.assign_employee_task(p_employee_id uuid, p_description text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; employee public.profiles; result public.assigned_tasks;
begin
 select * into actor from public.profiles where id = auth.uid();
 if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
   raise exception 'Only active managers and admins can assign tasks' using errcode = '42501';
 end if;
 select * into employee from public.profiles where id = p_employee_id;
 if employee.id is null or not public.can_receive_tasks(employee) or employee.status = 'INACTIVE'
   or employee.organization_id is distinct from actor.organization_id then
   raise exception 'Choose an active employee from your organization' using errcode = '42501';
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

create or replace function public.assign_unassigned_task(p_task_id uuid, p_employee_id uuid, p_due_date date default null)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; employee public.profiles; result public.assigned_tasks;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
    raise exception 'Only active managers and admins can assign tasks' using errcode = '42501';
  end if;
  select * into employee from public.profiles where id = p_employee_id;
  if employee.id is null or not public.can_receive_tasks(employee) or employee.status = 'INACTIVE'
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

create or replace function public.manager_update_task(p_task_id uuid, p_description text, p_project_name text,
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
    if employee.id is null or not public.can_receive_tasks(employee) or employee.status = 'INACTIVE'
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

commit;
notify pgrst, 'reload schema';
