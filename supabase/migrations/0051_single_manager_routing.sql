-- Voxel1 has one manager, and everything employees send (leave requests,
-- Today Task, late alerts) goes to their line manager. An employee with no
-- line manager would instead send leave to the Admin and Today Task to no one,
-- so every employee is given the organization's manager automatically.
--
-- Applies only when the organization has exactly one MANAGER; with several,
-- the Admin chooses each employee's line manager as before. An explicitly set
-- line manager is never replaced.

create or replace function public.sole_manager(org uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then (array_agg(id))[1] end
  from public.profiles
  where organization_id = org and role = 'MANAGER'
$$;

-- An employee saved without a line manager gets the sole manager.
create or replace function public.default_line_manager()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'EMPLOYEE' and new.line_manager_id is null and new.organization_id is not null then
    new.line_manager_id := public.sole_manager(new.organization_id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_default_line_manager on public.profiles;
create trigger profiles_default_line_manager
  before insert or update of role, line_manager_id, organization_id on public.profiles
  for each row execute function public.default_line_manager();

-- When the manager is added (or someone becomes the manager), employees who
-- still have no line manager are assigned to them.
create or replace function public.assign_employees_to_new_manager()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  manager uuid;
begin
  if new.role = 'MANAGER' and new.organization_id is not null then
    manager := public.sole_manager(new.organization_id);
    if manager is not null then
      update public.profiles
      set line_manager_id = manager
      where organization_id = new.organization_id
        and role = 'EMPLOYEE'
        and line_manager_id is null;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists profiles_assign_to_new_manager on public.profiles;
create trigger profiles_assign_to_new_manager
  after insert or update of role, organization_id on public.profiles
  for each row execute function public.assign_employees_to_new_manager();

-- Existing employees without a line manager.
update public.profiles p
set line_manager_id = public.sole_manager(p.organization_id)
where p.role = 'EMPLOYEE'
  and p.line_manager_id is null
  and public.sole_manager(p.organization_id) is not null;
