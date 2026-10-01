-- Preserve the first recorded Start time; historical start times are unknown.
alter table public.assigned_tasks add column started_at timestamptz;

create or replace function public.set_assigned_task_status(p_task_id uuid, p_status text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare result public.assigned_tasks;
begin
 if p_status is null or p_status not in ('START','PROGRESS','END') then
   raise exception 'Choose Start, Progress, or End';
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
