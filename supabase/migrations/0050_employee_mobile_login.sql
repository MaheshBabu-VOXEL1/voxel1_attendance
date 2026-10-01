-- Employees log in with their mobile number only (no password, no sign-up).
-- Managers and Admins keep email + password.
--
-- The employee-mobile-login edge function (service role) uses everything here;
-- none of it is readable by signed-in users or visitors.

-- ── Roster: employees entered directly in Supabase ─────────────────────────
-- Add a row with at least name, mobile and organization_id (Table Editor or SQL).
-- The first time that number logs in, the function creates the login account
-- and employee profile from the row, then deletes the row.
create table if not exists public.employee_roster (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  mobile          text not null,
  employee_id     text,
  department      text,
  designation     text,
  line_manager_id uuid references public.profiles(id) on delete set null,
  shift_id        uuid,
  joining_date    date,
  created         timestamptz not null default now()
);

create unique index if not exists employee_roster_unique_mobile
  on public.employee_roster (public.norm_mobile(mobile));

alter table public.employee_roster enable row level security;
-- No policies: only the service role (edge functions, Supabase dashboard) can touch it.

-- ── Attempt log for rate limiting ──────────────────────────────────────────
create table if not exists public.mobile_login_attempts (
  id      bigserial primary key,
  ip      text not null,
  mobile  text,
  created timestamptz not null default now()
);
create index if not exists mobile_login_attempts_ip_created on public.mobile_login_attempts (ip, created);
create index if not exists mobile_login_attempts_mobile_created on public.mobile_login_attempts (mobile, created);

alter table public.mobile_login_attempts enable row level security;

-- ── Lookups by normalised mobile (last 10 digits, same rule as 0042) ───────
create or replace function public.profile_by_mobile(p_mobile text)
returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles
  where public.norm_mobile(mobile) = public.norm_mobile(p_mobile)
    and public.norm_mobile(p_mobile) is not null
  limit 1
$$;

create or replace function public.roster_by_mobile(p_mobile text)
returns setof public.employee_roster
language sql stable security definer set search_path = public as $$
  select * from public.employee_roster
  where public.norm_mobile(mobile) = public.norm_mobile(p_mobile)
    and public.norm_mobile(p_mobile) is not null
  limit 1
$$;

revoke all on function public.profile_by_mobile(text) from public, anon, authenticated;
revoke all on function public.roster_by_mobile(text) from public, anon, authenticated;
grant execute on function public.profile_by_mobile(text) to service_role;
grant execute on function public.roster_by_mobile(text) to service_role;
