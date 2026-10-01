-- Keep only the last 10 days of attendance.
--
-- The Attendance Audit sheet shows today and the 9 days before it. Each night
-- the day that falls off the sheet is deleted from the database: on the 27th,
-- the 17th's records go and the sheet shows the 18th to the 27th. The audit-log
-- copies of those rows (including the log of the deletion itself) go too, so
-- the data is really gone. Leave requests and Today Task are not touched.
--
-- "Today" is the organization's own date (app_config.timezone, e.g.
-- Asia/Kolkata), not the server's UTC date.

create or replace function public.purge_old_attendance(keep_days integer default 10)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  org record;
  tz text;
  cutoff date;
  removed integer := 0;
  n integer;
begin
  if keep_days < 1 then
    raise exception 'keep_days must be at least 1';
  end if;

  for org in select id from public.organizations loop
    tz := coalesce(nullif(public.org_app_config(org.id) ->> 'timezone', ''), 'UTC');
    begin
      cutoff := (now() at time zone tz)::date - (keep_days - 1);
    exception when others then
      cutoff := (now() at time zone 'UTC')::date - (keep_days - 1);
    end;

    delete from public.attendance
    where organization_id = org.id and date < cutoff;
    get diagnostics n = row_count;
    removed := removed + n;

  end loop;

  -- Audit-log entries for attendance rows that no longer exist: the deleted
  -- days, the log of their deletion, and edit entries (which store only the
  -- changed fields, not the date).
  delete from public.audit_logs l
  where l.table_name = 'attendance'
    and not exists (select 1 from public.attendance a where a.id::text = l.record_id);

  return removed;
end;
$$;

revoke all on function public.purge_old_attendance(integer) from public, anon, authenticated;
grant execute on function public.purge_old_attendance(integer) to service_role;

-- Nightly at 00:05 India time (18:35 UTC). Supabase may not allow scheduling
-- from a migration; if this is skipped, scripts/setup-cron-schedules.sql
-- schedules the same job.
do $$
begin
  if to_regclass('cron.job') is not null then
    begin
      execute $cmd$select cron.unschedule(jobid) from cron.job where jobname = 'attendance-retention'$cmd$;
      execute $cmd$select cron.schedule('attendance-retention', '35 18 * * *', 'select public.purge_old_attendance(10)')$cmd$;
    exception when others then
      raise notice 'Could not schedule attendance-retention here: %', sqlerrm;
    end;
  end if;
end;
$$;
