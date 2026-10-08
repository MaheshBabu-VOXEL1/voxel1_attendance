-- Permanent human-readable IDs; UUID relationships remain unchanged.
alter table public.task_projects add column project_number bigint generated always as identity;
alter table public.task_projects add constraint task_projects_number_unique unique(project_number);
alter table public.assigned_tasks add column project_number bigint;
update public.assigned_tasks t set project_number = p.project_number
from public.task_projects p where p.id = t.project_id;

create or replace function public.link_task_project() returns trigger
language plpgsql security definer set search_path = public as $$
declare project public.task_projects;
begin
  if new.project_name is not null then
    -- Avoid consuming a new number for every task in an existing project.
    select * into project from public.task_projects
    where organization_id = new.organization_id and lower(trim(name)) = lower(trim(new.project_name));
    if not found then
      insert into public.task_projects(organization_id, name) values(new.organization_id, trim(new.project_name))
      on conflict (organization_id, lower(trim(name))) do update set name = task_projects.name
      returning * into project;
    end if;
    new.project_id := project.id;
    new.project_name := project.name;
    new.project_number := project.project_number;
  else
    new.project_id := null;
    new.project_number := null;
  end if;
  return new;
end;
$$;
notify pgrst, 'reload schema';
