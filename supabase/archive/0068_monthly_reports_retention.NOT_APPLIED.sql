-- ARCHIVED, DO NOT APPLY. Decision 2026-10-08: no automatic monthly deletion; attendance and tasks are kept permanently.
-- Kept for reference only. It lives outside supabase/migrations so `supabase db push` never runs it.

begin;
-- Opt-in per organization; this migration does not enable deletion for any tenant.
create table public.monthly_retention_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default false,
  first_cleanup_date date not null
);
alter table public.monthly_retention_settings enable row level security;
revoke all on public.monthly_retention_settings from public, anon, authenticated;
grant select on public.monthly_retention_settings to authenticated;
create policy monthly_retention_read on public.monthly_retention_settings for select to authenticated
using (organization_id = public.auth_org_id() and public.auth_role() in ('MANAGER','ADMIN'));

create table public.monthly_cleanup_runs (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cutoff date not null,
  attendance_deleted integer not null,
  tasks_deleted integer not null,
  finished_at timestamptz not null default now(),
  primary key (organization_id, cutoff)
);
alter table public.monthly_cleanup_runs enable row level security;
revoke all on public.monthly_cleanup_runs from public, anon, authenticated;

create function public.run_monthly_cleanup() returns void
language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  cutoff date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
  cutoff_time timestamptz;
  org record;
  attendance_count integer;
  task_count integer;
  removed_attendance text[];
begin
  -- Daily scheduler, but deletion only on the first local day of the month.
  if extract(day from today) <> 1 then return; end if;
  if not pg_try_advisory_xact_lock(680068) then return; end if;
  cutoff_time := cutoff::timestamp at time zone 'Asia/Kolkata';
  for org in select organization_id from public.monthly_retention_settings
    where enabled and first_cleanup_date <= today
  loop
    if exists(select 1 from public.monthly_cleanup_runs r where r.organization_id = org.organization_id and r.cutoff = cutoff) then continue; end if;
    -- Preserve active overnight sessions, including across a month boundary.
    with removed as (
      delete from public.attendance a where a.organization_id = org.organization_id
      and a.date < cutoff and (a.check_in is null or a.check_out is not null)
      returning a.id::text
    ) select coalesce(array_agg(id), array[]::text[]) into removed_attendance from removed;
    attendance_count := cardinality(removed_attendance);
    -- Remove audit copies only for the attendance rows deleted by this run.
    delete from public.audit_logs l where l.organization_id = org.organization_id
      and l.table_name = 'attendance' and l.record_id = any(removed_attendance);
    delete from public.assigned_tasks t where t.organization_id = org.organization_id
      and t.status = 'END' and t.created < cutoff_time
      and coalesce(t.completed_at, t.updated, t.created) < cutoff_time;
    get diagnostics task_count = row_count;
    insert into public.monthly_cleanup_runs(organization_id,cutoff,attendance_deleted,tasks_deleted)
      values(org.organization_id,cutoff,attendance_count,task_count);
  end loop;
end;
$$;
revoke all on function public.run_monthly_cleanup() from public, anon, authenticated;

-- Retain project choices after completed tasks have been cleared.
grant select (id, organization_id, name, project_number) on public.task_projects to authenticated;
create policy task_projects_manager_read on public.task_projects for select to authenticated
using (organization_id = public.auth_org_id() and public.auth_role() in ('MANAGER','ADMIN'));

-- pg_cron uses GMT on this deployment: 18:45 UTC = 00:15 next day in India.
-- If pg_cron is absent or uses another timezone, fail instead of silently skipping cleanup.
do $$
begin
  if to_regclass('cron.job') is null then raise exception 'Enable pg_cron before applying monthly retention'; end if;
  if coalesce(current_setting('cron.timezone',true),'GMT') not in ('GMT','UTC') then
    raise exception 'Monthly cleanup expects a UTC/GMT cron timezone';
  end if;
end;
$$;
select cron.schedule('voxel1-monthly-cleanup', '45 18 * * *', 'select public.run_monthly_cleanup()');
notify pgrst, 'reload schema';
commit;
