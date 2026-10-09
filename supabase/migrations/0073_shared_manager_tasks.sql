-- One organization-wide task board for every manager, including employees
-- currently using manager mode. Keep the real creator in assigned_by/name.
begin;
drop policy if exists assigned_tasks_read on public.assigned_tasks;
create policy assigned_tasks_read on public.assigned_tasks for select to authenticated using (
  organization_id = public.auth_org_id()
  and (
    employee_id = auth.uid() or assigned_by = auth.uid()
    or exists (
      select 1 from public.profiles actor
      where actor.id = auth.uid() and actor.organization_id = assigned_tasks.organization_id
        and actor.role in ('MANAGER','ADMIN') and actor.status <> 'INACTIVE'
    )
  )
);
commit;
notify pgrst, 'reload schema';
