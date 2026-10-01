-- The HR account type is retired: an organization now has only Admin,
-- Manager and Employee accounts (plus the platform Super Admin).

-- Existing HR accounts keep the same access as Admins.
update public.profiles set role = 'ADMIN' where role = 'HR';

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('SUPER_ADMIN','ADMIN','MANAGER','EMPLOYEE'));

-- Leave workflows saved with the old "HR" approver route to Admin.
update public.settings
set value = replace(value, '"approverRole":"HR"', '"approverRole":"ADMIN"'), updated = now()
where key = 'workflows' and value like '%"approverRole":"HR"%';
