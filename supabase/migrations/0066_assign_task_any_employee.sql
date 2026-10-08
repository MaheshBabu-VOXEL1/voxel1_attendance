-- Managers can assign tasks to any active employee in their organization, not only direct reports.
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
 if employee.id is null or employee.role <> 'EMPLOYEE' or employee.status = 'INACTIVE'
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

notify pgrst, 'reload schema';
