-- Phone notifications for announcements and tasks due today.
--  * Announcement: every active member of the organisation (except the person who made it) gets a
--    notification -> phone push. Made for today: sent at once. Made for a later date: sent at
--    08:00 IST on that day (cron job 'voxel1-announcement-push').
--  * Due today: at 10:30 IST (cron job 'voxel1-due-today-push') every active Manager/Admin gets one
--    notification per person who has unfinished tasks due today, e.g. "Due today: Ravi - 2 tasks".
-- Every notification row is pushed to the phone by the existing trigger from 0100.
begin;

alter table public.calendar_events add column if not exists notified_at timestamptz;

create or replace function public.send_announcement_notifications(p_event_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare ev public.calendar_events; sent integer;
begin
  -- Lock and mark first, so a trigger and the cron job never both send it.
  update public.calendar_events set notified_at = now()
   where id = p_event_id and kind = 'announcement' and notified_at is null
   returning * into ev;
  if ev.id is null then return 0; end if;
  insert into public.notifications(organization_id, user_id, type, title, message, priority,
                                   reference_id, reference_type, action_url, metadata)
  select ev.organization_id, p.id, 'ANNOUNCEMENT',
         'Announcement' || coalesce(' · ' || to_char(ev.event_date + ev.event_time, 'FMHH12:MI AM'), ''),
         left(ev.title, 500), 'HIGH', ev.id::text, 'announcement', 'dashboard',
         jsonb_build_object('date', ev.event_date)
    from public.profiles p
   where p.organization_id = ev.organization_id and p.status <> 'INACTIVE'
     and p.id is distinct from ev.created_by;
  get diagnostics sent = row_count;
  return sent;
end $$;
revoke all on function public.send_announcement_notifications(uuid) from public, anon, authenticated;

create or replace function public.calendar_announcement_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'announcement' and new.event_date <= (now() at time zone 'Asia/Kolkata')::date then
    perform public.send_announcement_notifications(new.id);
  end if;
  return new;
end $$;
revoke all on function public.calendar_announcement_notify() from public, anon, authenticated;
drop trigger if exists calendar_announcement_notify on public.calendar_events;
create trigger calendar_announcement_notify after insert on public.calendar_events
  for each row execute function public.calendar_announcement_notify();

-- Announcements already on the calendar before this migration are not re-sent.
update public.calendar_events set notified_at = coalesce(notified_at, now())
 where kind = 'announcement' and event_date <= (now() at time zone 'Asia/Kolkata')::date;

-- Cron: today's announcements made earlier for this date.
create or replace function public.send_due_announcements()
returns integer language plpgsql security definer set search_path = public as $$
declare ev record; total integer := 0;
begin
  for ev in select id from public.calendar_events
             where kind = 'announcement' and notified_at is null
               and event_date = (now() at time zone 'Asia/Kolkata')::date loop
    total := total + public.send_announcement_notifications(ev.id);
  end loop;
  return total;
end $$;
revoke all on function public.send_due_announcements() from public, anon, authenticated;

-- Cron: one "Due today" notification per assignee to every active Manager/Admin.
create or replace function public.send_due_today_task_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Kolkata')::date; total integer;
begin
  with due as (
    select t.organization_id, t.employee_id, max(coalesce(t.employee_name, 'Employee')) as who,
           count(*) as n,
           string_agg(left(t.description, 80), '; ' order by t.priority = 'HIGH' desc, t.created) as list
      from public.assigned_tasks t
     where t.due_date = today and t.status <> 'END' and t.employee_id is not null
     group by t.organization_id, t.employee_id
  )
  insert into public.notifications(organization_id, user_id, type, title, message, priority,
                                   reference_id, reference_type, action_url, metadata)
  select d.organization_id, m.id, 'TASK',
         'Due today: ' || d.who || ' · ' || d.n || case when d.n = 1 then ' task' else ' tasks' end,
         left(d.list, 400), 'NORMAL', d.employee_id::text, 'task_due', 'dashboard',
         jsonb_build_object('date', today, 'employee_id', d.employee_id)
    from due d
    join public.profiles m on m.organization_id = d.organization_id
     and m.role in ('MANAGER','ADMIN') and m.status <> 'INACTIVE'
   where not exists (select 1 from public.notifications x
                      where x.user_id = m.id and x.reference_type = 'task_due'
                        and x.reference_id = d.employee_id::text
                        and x.metadata->>'date' = today::text);
  get diagnostics total = row_count;
  return total;
end $$;
revoke all on function public.send_due_today_task_notifications() from public, anon, authenticated;

commit;

-- Schedules (pg_cron runs in UTC): 02:30 UTC = 08:00 IST, 05:00 UTC = 10:30 IST.
do $$
begin
  if to_regclass('cron.job') is not null then
    begin
      perform cron.unschedule(jobid) from cron.job where jobname in ('voxel1-announcement-push', 'voxel1-due-today-push');
      perform cron.schedule('voxel1-announcement-push', '30 2 * * *', 'select public.send_due_announcements()');
      perform cron.schedule('voxel1-due-today-push', '0 5 * * *', 'select public.send_due_today_task_notifications()');
    exception when others then
      raise notice 'Could not schedule notification jobs here: %', sqlerrm;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';
