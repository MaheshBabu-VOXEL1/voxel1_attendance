-- Auto check-out at the close time (default 23:59 org time), run inside the database by pg_cron.
-- Replaces the cron-auto-close-sessions edge function, which was never scheduled live and needed a
-- deployed function + secret. Same rules: close any open session whose date + close time (in the org
-- time zone) has passed. Close time = employee shift's auto_session_close_time, else app_config
-- autoSessionCloseTime, else 23:59. Remarks carry "[System: ...", so no "checked out" notification
-- is sent to managers (see 0104).
create or replace function public.auto_close_attendance_sessions() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
 with cfg as (
   select organization_id,
          coalesce(nullif(value::jsonb->>'timezone',''),'UTC') as tz,
          coalesce(nullif(value::jsonb->>'autoSessionCloseTime',''),'23:59') as close_time
   from settings where key = 'app_config'
 ), due as (
   select a.id,
          (a.date + coalesce(s.auto_session_close_time, c.close_time::time)) at time zone c.tz as stamp,
          a.date < (now() at time zone c.tz)::date as past
   from attendance a
   join cfg c on c.organization_id = a.organization_id
   left join profiles p on p.id = public.try_uuid(a.employee_id)
   left join shifts s on s.id = p.shift_id
   where a.check_out is null and a.check_in is not null and coalesce(a.status,'') <> 'ABSENT'
 )
 update attendance a
    set check_out = greatest(due.stamp, a.check_in),
        remarks = coalesce(a.remarks,'') || case when due.past then ' [System: Auto-Closed Past Date]' else ' [System: Max Time Reached]' end,
        updated = now()
   from due
  where a.id = due.id and due.stamp <= now();
 get diagnostics n = row_count;
 return n;
end $$;
revoke all on function public.auto_close_attendance_sessions() from public, anon, authenticated;

-- pg_cron runs in UTC; every 5 minutes.
do $$
begin
  if to_regclass('cron.job') is not null then
    begin
      perform cron.unschedule(jobid) from cron.job where jobname = 'voxel1-auto-close-sessions';
      perform cron.schedule('voxel1-auto-close-sessions', '3-59/5 * * * *', 'select public.auto_close_attendance_sessions()');
    exception when others then
      raise notice 'Could not schedule auto-close here: %', sqlerrm;
    end;
  end if;
end $$;
