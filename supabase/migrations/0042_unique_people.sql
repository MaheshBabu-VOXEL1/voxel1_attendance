-- ============================================================
-- Voxel1 — No duplicate email, phone number or name
-- 0042_unique_people.sql
--
-- Across the whole app (every organization), no two people may share:
--   * an email address   — compared case-insensitively, trimmed
--   * a phone number     — compared on its last 10 digits, so "+91 98765 43210",
--                          "098765-43210" and "9876543210" are the same number
--   * a full name        — compared case-insensitively, spaces collapsed
--
-- The unique indexes are the real guard. person_conflict() lets the edge
-- functions and the app say *which* field clashes before anything is written,
-- so no half-created account is left behind. It is SECURITY DEFINER because
-- RLS hides other organizations' people, and the rule spans all of them. It
-- returns only the name of the clashing field, never whose it is.
-- ============================================================

create or replace function public.norm_email(v text) returns text
language sql immutable as $$ select nullif(lower(btrim(v)), '') $$;

create or replace function public.norm_mobile(v text) returns text
language sql immutable as $$
  select case when length(regexp_replace(coalesce(v, ''), '\D', '', 'g')) >= 7
              then right(regexp_replace(v, '\D', '', 'g'), 10) end
$$;

create or replace function public.norm_name(v text) returns text
language sql immutable as $$ select nullif(lower(regexp_replace(btrim(coalesce(v, '')), '\s+', ' ', 'g')), '') $$;

create unique index if not exists profiles_unique_email
  on public.profiles (public.norm_email(email)) where public.norm_email(email) is not null;
create unique index if not exists profiles_unique_mobile
  on public.profiles (public.norm_mobile(mobile)) where public.norm_mobile(mobile) is not null;
create unique index if not exists profiles_unique_name
  on public.profiles (public.norm_name(name)) where public.norm_name(name) is not null;

create or replace function public.person_conflict(
  p_email text default null,
  p_mobile text default null,
  p_name text default null,
  p_exclude_id uuid default null
) returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.norm_email(p_email) is not null and exists (
      select 1 from public.profiles
       where public.norm_email(email) = public.norm_email(p_email)
         and id is distinct from p_exclude_id) then 'email'
    when public.norm_mobile(p_mobile) is not null and exists (
      select 1 from public.profiles
       where public.norm_mobile(mobile) = public.norm_mobile(p_mobile)
         and id is distinct from p_exclude_id) then 'mobile'
    when public.norm_name(p_name) is not null and exists (
      select 1 from public.profiles
       where public.norm_name(name) = public.norm_name(p_name)
         and id is distinct from p_exclude_id) then 'name'
  end
$$;

revoke all on function public.person_conflict(text, text, text, uuid) from public;
grant execute on function public.person_conflict(text, text, text, uuid) to authenticated, service_role;
