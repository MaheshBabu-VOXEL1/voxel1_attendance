-- Varshini (7995687988) joins the account-switch members (nine in total):
-- she gets the Employee/Manager toggle and the Manager portal like the others.
begin;
create or replace function public.is_mode_switcher(p public.profiles)
returns boolean language sql stable security definer set search_path = public as $$
  -- coalesce: a profile with no mobile must be false, not null.
  select coalesce(p.id is not null and p.role in ('EMPLOYEE','MANAGER') and p.status <> 'INACTIVE'
    and public.norm_mobile(p.mobile) in
      ('9885229887','7893960331','7989626574','7794862595','8331951390','9795611931','8978612058','7700901979','7995687988'), false);
$$;
revoke all on function public.is_mode_switcher(public.profiles) from public, anon, authenticated;
commit;
notify pgrst, 'reload schema';
