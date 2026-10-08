-- Project dropdown for the manager app: list the organization's projects (even ones
-- with no tasks yet) and create a new one up front. task_projects stays closed to
-- direct reads; these functions are the only way in.
begin;

create function public.list_task_projects()
returns table(id uuid, name text, project_number bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.project_number
  from public.task_projects p
  join public.profiles a on a.id = auth.uid()
  where p.organization_id = a.organization_id and a.status <> 'INACTIVE'
  order by lower(p.name)
$$;

create function public.create_task_project(p_name text)
returns table(id uuid, name text, project_number bigint)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare actor public.profiles; proj public.task_projects;
begin
  select * into actor from public.profiles where profiles.id = auth.uid();
  if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
    raise exception 'Only active managers and admins can create projects' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 200 then
    raise exception 'Enter a project name between 1 and 200 characters';
  end if;
  -- Same name (ignoring case and spaces) returns the existing project instead of a duplicate.
  insert into public.task_projects(organization_id, name) values (actor.organization_id, trim(p_name))
  on conflict (organization_id, lower(trim(name))) do update set name = task_projects.name
  returning * into proj;
  return query select proj.id, proj.name, proj.project_number;
end;
$$;

revoke all on function public.list_task_projects() from public, anon;
grant execute on function public.list_task_projects() to authenticated;
revoke all on function public.create_task_project(text) from public, anon;
grant execute on function public.create_task_project(text) to authenticated;

commit;
notify pgrst, 'reload schema';
