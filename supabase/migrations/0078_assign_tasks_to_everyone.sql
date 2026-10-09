-- Every active employee and manager can be given a task, the Manager included
-- (they can add tasks for themselves), and anyone can update the status of a
-- task assigned to them, in either mode.
begin;

create or replace function public.can_receive_tasks(p public.profiles)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p.role in ('EMPLOYEE','MANAGER'), false);
$$;
revoke all on function public.can_receive_tasks(public.profiles) from public, anon, authenticated;

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
   and p.role in ('EMPLOYEE','MANAGER') and p.status <> 'INACTIVE' and p.organization_id = t.organization_id)
 returning t.* into result;
 if not found then raise exception 'You can update only your assigned tasks' using errcode = '42501'; end if;
 return result;
end;
$$;

commit;
notify pgrst, 'reload schema';
