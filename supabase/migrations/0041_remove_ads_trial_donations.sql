-- ============================================================
-- Voxel1 — No ads, no trial, no donations
-- 0041_remove_ads_trial_donations.sql
--
-- The app no longer shows ads, so the things that only existed because of
-- ads go with them:
--
--   * TRIAL was a 14-day ad-free window and AD_SUPPORTED what came after it.
--     Every organization is now simply ACTIVE. EXPIRED (read-only) and
--     SUSPENDED stay: they are super-admin controls, not plans.
--   * Donations bought an ad-free period. upgrade_requests, the donation
--     screenshot bucket and the subscription_expires column are dropped.
--   * trial_end_date and ad_consent are dropped. The two reports that
--     selected trial_end_date are recreated without it.
--   * The trial email audiences, the ad slot settings and the upgrade
--     notifications are deleted.
-- ============================================================

-- ── Organizations: one free plan ────────────────────────────────────────────
update public.organizations
   set subscription_status = 'ACTIVE'
 where subscription_status in ('TRIAL', 'AD_SUPPORTED');

alter table public.organizations
  drop constraint if exists organizations_subscription_status_check;
alter table public.organizations
  alter column subscription_status set default 'ACTIVE';
alter table public.organizations
  add constraint organizations_subscription_status_check
  check (subscription_status in ('ACTIVE', 'EXPIRED', 'SUSPENDED'));

-- Both of these select trial_end_date, so they must go before the column does.
drop view if exists ai_reports.organizations;
drop function if exists public.org_hygiene_report();

alter table public.organizations
  drop column if exists trial_end_date,
  drop column if exists subscription_expires,
  drop column if exists ad_consent;

-- ── Recreate the hygiene report (0028) without org_trial_end ────────────────
create or replace function public.org_hygiene_report()
returns table (
  org_id              uuid,
  org_name            text,
  org_created         timestamptz,
  org_country         text,
  org_subscription    text,
  org_is_demo         boolean,
  user_count          int,
  unverified_count    int,
  attendance_count    int,
  leave_count         int,
  settings_count      int,
  admin_email         text,
  last_activity       timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only SUPER_ADMIN may run the organization hygiene report'
      using errcode = '42501';
  end if;

  return query
  with u as (
    select p.organization_id as oid,
           count(*)::int as n,
           count(*) filter (where p.verified is not true)::int as unv
    from public.profiles p
    where p.organization_id is not null
    group by p.organization_id
  ), a as (
    select t.organization_id as oid, count(*)::int as n, max(t.created) as last_at
    from public.attendance t
    where t.organization_id is not null
    group by t.organization_id
  ), l as (
    select v.organization_id as oid, count(*)::int as n, max(v.created) as last_at
    from public.leaves v
    where v.organization_id is not null
    group by v.organization_id
  ), s as (
    select st.organization_id as oid, count(*)::int as n
    from public.settings st
    where st.organization_id is not null
    group by st.organization_id
  ), adm as (
    -- The founding admin: earliest ADMIN profile in the organization.
    select distinct on (p.organization_id) p.organization_id as oid, p.email as email
    from public.profiles p
    where p.role = 'ADMIN' and p.organization_id is not null
    order by p.organization_id, p.created
  )
  select
    o.id,
    o.name,
    o.created,
    o.country,
    o.subscription_status,
    coalesce(o.is_demo, false),
    coalesce(u.n, 0),
    coalesce(u.unv, 0),
    coalesce(a.n, 0),
    coalesce(l.n, 0),
    coalesce(s.n, 0),
    adm.email,
    greatest(a.last_at, l.last_at)
  from public.organizations o
  left join u   on u.oid   = o.id
  left join a   on a.oid   = o.id
  left join l   on l.oid   = o.id
  left join s   on s.oid   = o.id
  left join adm on adm.oid = o.id
  order by o.created desc;
end;
$$;

revoke all on function public.org_hygiene_report() from public;
grant execute on function public.org_hygiene_report() to authenticated;

-- ── Recreate the AI report view (0032) without trial_end_date ──────────────
create or replace view ai_reports.organizations as
with u as (
  select organization_id oid, count(*)::int n,
         count(*) filter (where verified is not true)::int unverified
  from public.profiles where organization_id is not null group by organization_id
), a as (
  select organization_id oid, count(*)::int n, max(created) last_at
  from public.attendance where organization_id is not null group by organization_id
), l as (
  select organization_id oid, count(*)::int n
  from public.leaves where organization_id is not null group by organization_id
), s as (
  select organization_id oid, count(*)::int n
  from public.settings where organization_id is not null group by organization_id
), adm as (
  select distinct on (organization_id)
         organization_id oid, email, name, verified
  from public.profiles where role = 'ADMIN' and organization_id is not null
  order by organization_id, created
)
select
  o.id                                as organization_id,
  o.name                              as organization_name,
  o.country,
  o.subscription_status,
  o.created                           as registered_at,
  coalesce(o.is_demo, false)          as is_demo,
  adm.email                           as admin_email,
  adm.name                            as admin_name,
  coalesce(adm.verified, false)       as admin_email_confirmed,
  coalesce(u.n, 0)                    as user_count,
  coalesce(u.unverified, 0)           as unconfirmed_user_count,
  coalesce(a.n, 0)                    as attendance_count,
  coalesce(l.n, 0)                    as leave_count,
  coalesce(s.n, 0)                    as settings_count,
  a.last_at                           as last_attendance_at,
  (coalesce(a.n,0) = 0 and coalesce(l.n,0) = 0) as never_used,
  (now()::date - o.created::date)     as days_since_registration
from public.organizations o
left join u   on u.oid   = o.id
left join a   on a.oid   = o.id
left join l   on l.oid   = o.id
left join s   on s.oid   = o.id
left join adm on adm.oid = o.id;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'ai_readonly') then
    grant select on ai_reports.organizations to ai_readonly;
  end if;
end;
$$;

-- ── Lifecycle email: no trial audiences ─────────────────────────────────────
delete from public.email_templates
 where audience in ('TRIAL_ENDING', 'TRIAL_EXPIRED');

alter table public.email_templates
  drop constraint if exists email_templates_audience_check;
alter table public.email_templates
  add constraint email_templates_audience_check check (audience in (
    'UNCONFIRMED_ADMIN',  -- admin registered, never confirmed the address
    'NO_EMPLOYEES',       -- confirmed, but never added anyone
    'NO_ATTENDANCE',      -- has employees, nobody has ever checked in
    'WELCOME',            -- confirmed and set up; stage counts days since registering
    'SETUP_INCOMPLETE',   -- no settings ever saved, so onboarding was abandoned
    'DORMANT',            -- was active once; stage counts days since last activity
    'ACTIVE_ENGAGED'      -- healthy and in use; for product news and tips
  ));

comment on column public.email_templates.audience is
  'Which group the daily job resolves for this template. For DORMANT the stage counts days since last activity; for everything else it counts days since the qualifying event.';

-- ── Donations and upgrade requests ──────────────────────────────────────────
drop table if exists public.upgrade_requests;

delete from public.notifications where type = 'UPGRADE_REQUEST';

drop policy if exists "donation_screenshots_select" on storage.objects;
drop policy if exists "donation_screenshots_insert" on storage.objects;
drop policy if exists "donation_screenshots_update" on storage.objects;
drop policy if exists "donation_screenshots_delete" on storage.objects;

-- Newer Supabase storage refuses direct deletes from its tables. If it does,
-- the bucket is left behind with no policies (unusable) and can be removed
-- from the dashboard.
do $$
begin
  delete from storage.buckets
   where id = 'donation-screenshots'
     and not exists (select 1 from storage.objects where bucket_id = 'donation-screenshots');
exception when others then
  raise notice 'donation-screenshots bucket not removed: %', sqlerrm;
end;
$$;

-- ── Ads ─────────────────────────────────────────────────────────────────────
delete from public.settings where key like 'ad\_config\_%';

-- ── The nightly trial job, if it was ever scheduled ─────────────────────────
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'auto-expire-trials';
  end if;
end;
$$;
