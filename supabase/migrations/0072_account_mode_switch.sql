-- Only these five existing employee identities may use both account modes.
begin;

create or replace function public.can_switch_account_mode()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid()
      and role in ('EMPLOYEE','MANAGER') and status <> 'INACTIVE'
      and public.norm_mobile(mobile) in
        ('9885229887','7893960331','7989626574','7794862595','8331951390')
  );
$$;
revoke all on function public.can_switch_account_mode() from public, anon;
grant execute on function public.can_switch_account_mode() to authenticated;

-- Keep all existing profile protections, permitting only an eligible user's
-- own EMPLOYEE <-> MANAGER role change. Mobile and organization stay protected.
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
declare editable constant text[] := array['name','avatar','emergency_contact','location','updated'];
begin
  if auth.uid() is null or public.auth_role() = 'ADMIN' then return new; end if;
  if old.id = auth.uid() and public.can_switch_account_mode()
    and old.role in ('EMPLOYEE','MANAGER') and new.role in ('EMPLOYEE','MANAGER')
    and (to_jsonb(new) - 'role' - editable) is not distinct from (to_jsonb(old) - 'role' - editable)
  then return new; end if;
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'NOT_ALLOWED: only an Admin can change this part of a profile' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.switch_account_mode(p_role text)
returns text language plpgsql security definer set search_path = public as $$
begin
  -- Lock before checking eligibility so a concurrent admin edit cannot race it.
  perform 1 from public.profiles where id = auth.uid() for update;
  if p_role is null or p_role not in ('EMPLOYEE','MANAGER') or not public.can_switch_account_mode() then
    raise exception 'This account cannot switch modes' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = auth.uid() and role <> p_role;
  return p_role;
end;
$$;
revoke all on function public.switch_account_mode(text) from public, anon;
grant execute on function public.switch_account_mode(text) to authenticated;

create or replace function public.default_line_manager()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Account mode changes must not reassign anyone's reporting manager.
  if TG_OP = 'UPDATE' then
    if old.id = auth.uid() and old.role in ('EMPLOYEE','MANAGER')
      and new.role in ('EMPLOYEE','MANAGER') and old.role <> new.role
      and public.can_switch_account_mode() then return new; end if;
  end if;
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
  -- Account mode changes must not reassign anyone's reporting manager.
  if TG_OP = 'UPDATE' then
    if old.id = auth.uid() and old.role in ('EMPLOYEE','MANAGER')
      and new.role in ('EMPLOYEE','MANAGER') and old.role <> new.role
      and public.can_switch_account_mode() then return new; end if;
  end if;
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

commit;
notify pgrst, 'reload schema';


