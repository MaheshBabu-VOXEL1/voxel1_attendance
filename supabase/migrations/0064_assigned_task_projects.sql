-- Preserve existing tasks and legacy callers; new assignments include a project.
alter table public.assigned_tasks add column project_name text
  check (project_name is null or length(trim(project_name)) between 1 and 200);

create function public.assign_employee_task(p_employee_id uuid, p_description text, p_project_name text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare result public.assigned_tasks;
begin
  if p_project_name is null or length(trim(p_project_name)) not between 1 and 200 then
    raise exception 'Enter a project name between 1 and 200 characters';
  end if;
  -- Reuse the existing role, organization, team and description checks.
  result := public.assign_employee_task(p_employee_id, p_description);
  update public.assigned_tasks set project_name = trim(p_project_name)
    where id = result.id returning * into result;
  return result;
end;
$$;
revoke all on function public.assign_employee_task(uuid,text,text) from public, anon;
grant execute on function public.assign_employee_task(uuid,text,text) to authenticated;
