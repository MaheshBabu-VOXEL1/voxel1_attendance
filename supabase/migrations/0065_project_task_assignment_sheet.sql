-- Stable, organization-scoped project IDs, including historical assignments.
create table public.task_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 200)
);
create unique index task_projects_name on public.task_projects(organization_id, lower(trim(name)));
alter table public.task_projects enable row level security;
revoke all on public.task_projects from public, anon, authenticated;
grant all on public.task_projects to service_role;
alter table public.assigned_tasks add column project_id uuid references public.task_projects(id);
alter table public.assigned_tasks add column due_date date;
insert into public.task_projects(organization_id, name)
select distinct on (organization_id, lower(trim(project_name))) organization_id, trim(project_name)
from public.assigned_tasks where project_name is not null
order by organization_id, lower(trim(project_name)), created;
update public.assigned_tasks t set project_id = p.id, project_name = p.name
from public.task_projects p where t.organization_id = p.organization_id and lower(trim(t.project_name)) = lower(trim(p.name));

create function public.link_task_project() returns trigger
language plpgsql security definer set search_path = public as $$
declare project public.task_projects;
begin
  if new.project_name is not null then
    insert into public.task_projects(organization_id, name) values(new.organization_id, trim(new.project_name))
    on conflict (organization_id, lower(trim(name))) do update set name = task_projects.name
    returning * into project;
    new.project_id := project.id;
    new.project_name := project.name;
  else
    new.project_id := null;
  end if;
  return new;
end;
$$;
revoke all on function public.link_task_project() from public, anon, authenticated;
create trigger assigned_task_project before insert or update of project_name on public.assigned_tasks
for each row execute function public.link_task_project();

create function public.assign_employee_task(p_employee_id uuid, p_description text, p_project_name text, p_due_date date, p_status text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare result public.assigned_tasks;
begin
  if p_due_date is null then raise exception 'Choose a due date'; end if;
  if p_status is null or p_status not in ('NOT_STARTED','START','PROGRESS','END') then
    raise exception 'Choose a valid task status';
  end if;
  -- Existing function enforces active role, organization and direct-report access.
  result := public.assign_employee_task(p_employee_id, p_description, p_project_name);
  update public.assigned_tasks set due_date = p_due_date, status = p_status,
    started_at = case when p_status <> 'NOT_STARTED' then now() else null end,
    completed_at = case when p_status = 'END' then now() else null end
  where id = result.id returning * into result;
  return result;
end;
$$;
revoke all on function public.assign_employee_task(uuid,text,text,date,text) from public, anon;
grant execute on function public.assign_employee_task(uuid,text,text,date,text) to authenticated;
