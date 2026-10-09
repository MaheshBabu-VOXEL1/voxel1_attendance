-- Kesari (7700901979) can also use the Employee/Manager toggle (eight switch
-- members). Kesari stays everyone's line manager: sole_manager() skips switch
-- members, so it now falls back to Kesari when no other manager is left.
begin;

create or replace function public.is_mode_switcher(p public.profiles)
returns boolean language sql stable security definer set search_path = public as $$
  -- coalesce: a profile with no mobile must be false, not null.
  select coalesce(p.id is not null and p.role in ('EMPLOYEE','MANAGER') and p.status <> 'INACTIVE'
    and public.norm_mobile(p.mobile) in
      ('9885229887','7893960331','7989626574','7794862595','8331951390','9795611931','8978612058','7700901979'), false);
$$;
revoke all on function public.is_mode_switcher(public.profiles) from public, anon, authenticated;

create or replace function public.sole_manager(org uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when count(*) = 1 then (array_agg(p.id))[1] end
       from public.profiles p
      where p.organization_id = org and p.role = 'MANAGER' and p.status <> 'INACTIVE'
        and not public.is_mode_switcher(p)),
    (select p.id from public.profiles p
      where p.organization_id = org and p.status <> 'INACTIVE' and public.norm_mobile(p.mobile) = '7700901979'
      limit 1));
$$;

commit;
notify pgrst, 'reload schema';
