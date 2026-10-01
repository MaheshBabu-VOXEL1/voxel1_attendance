-- Employees can write their own task (My Task) and send it to their line manager.
-- Stored in assigned_tasks with self_created = true and assigned_by = the line manager,
-- so the manager reads it through the existing policy and the employee updates its
-- status with set_assigned_task_status like any assigned task.
alter table public.assigned_tasks add column self_created boolean not null default false;

create function public.create_own_task(p_description text, p_status text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; manager public.profiles; result public.assigned_tasks;
begin
 select * into actor from public.profiles where id = auth.uid();
 if actor.id is null or actor.role <> 'EMPLOYEE' or actor.status = 'INACTIVE' then
   raise exception 'Only active employees can send their own tasks' using errcode = '42501';
 end if;
 select * into manager from public.profiles where id = actor.line_manager_id;
 if manager.id is null or manager.organization_id is distinct from actor.organization_id then
   raise exception 'You have no manager yet. Ask your admin to assign one.' using errcode = '42501';
 end if;
 if p_description is null or length(trim(p_description)) not between 1 and 4000 then
   raise exception 'Enter a task between 1 and 4000 characters';
 end if;
 if p_status is null or p_status not in ('START','PROGRESS','END') then
   raise exception 'Choose Start, Progress, or End';
 end if;
 insert into public.assigned_tasks(organization_id, employee_id, assigned_by, employee_name, manager_name,
   description, status, self_created, started_at, completed_at)
 values(actor.organization_id, actor.id, manager.id, coalesce(actor.name,'Employee'), coalesce(manager.name,'Manager'),
   trim(p_description), p_status, true, now(), case when p_status = 'END' then now() end)
 returning * into result;
 return result;
end;
$$;
revoke all on function public.create_own_task(text,text) from public, anon;
grant execute on function public.create_own_task(text,text) to authenticated;
