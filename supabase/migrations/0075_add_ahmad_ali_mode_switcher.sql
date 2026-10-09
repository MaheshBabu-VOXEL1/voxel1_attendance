-- Ahmad Ali (9795611931) joins the account-switch members (six in total).
begin;
create or replace function public.is_mode_switcher(p public.profiles)
returns boolean language sql stable security definer set search_path = public as $$
  -- coalesce: a profile with no mobile (the main Manager) must be false, not null.
  select coalesce(p.id is not null and p.role in ('EMPLOYEE','MANAGER') and p.status <> 'INACTIVE'
    and public.norm_mobile(p.mobile) in
      ('9885229887','7893960331','7989626574','7794862595','8331951390','9795611931'), false);
$$;
revoke all on function public.is_mode_switcher(public.profiles) from public, anon, authenticated;
commit;
notify pgrst, 'reload schema';
