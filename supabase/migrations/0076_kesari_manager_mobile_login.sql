-- Kesari (7700901979) is Voxel1's Manager and logs in by mobile like everyone
-- else; the email-login placeholder "Test Manager" (manager@gmail.com) is retired.
begin;

-- Members in Manager mode and deactivated accounts are not "the" manager, so
-- new employees keep getting Kesari as their line manager automatically.
create or replace function public.sole_manager(org uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then (array_agg(p.id))[1] end
  from public.profiles p
  where p.organization_id = org and p.role = 'MANAGER' and p.status <> 'INACTIVE'
    and not public.is_mode_switcher(p)
$$;

do $$
declare
  kesari uuid;
  old_mgr uuid;
begin
  select id into kesari from public.profiles where public.norm_mobile(mobile) = '7700901979';
  select id into old_mgr from public.profiles where lower(email) = 'manager@gmail.com' and role = 'MANAGER';
  if kesari is null then raise exception 'No profile with mobile 7700901979'; end if;

  update public.profiles set role = 'MANAGER', line_manager_id = null where id = kesari;

  if old_mgr is not null then
    update public.profiles set status = 'INACTIVE' where id = old_mgr;
    update public.profiles set line_manager_id = kesari
      where line_manager_id::text = old_mgr::text and id <> kesari;
    update public.leaves set line_manager_id = kesari
      where line_manager_id::text = old_mgr::text and status = 'PENDING_MANAGER';
  end if;

  update public.profiles set line_manager_id = kesari
    where role = 'EMPLOYEE' and line_manager_id is null and id <> kesari
      and organization_id = (select organization_id from public.profiles where id = kesari);
end $$;

commit;
notify pgrst, 'reload schema';
