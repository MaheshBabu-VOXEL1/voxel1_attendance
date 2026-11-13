-- Announcements can carry a time (e.g. "Team meeting" at 11:00); employees see the date and time.
-- The time is optional. The old 2-argument function is replaced by one whose time defaults to null,
-- so the app version still calling it with only text and date keeps working.
begin;
alter table public.calendar_events add column if not exists event_time time;

drop function if exists public.add_calendar_announcement(text, date);
create or replace function public.add_calendar_announcement(p_text text, p_date date, p_time time default null)
returns public.calendar_events
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; result public.calendar_events;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.status = 'INACTIVE'
     or not (actor.role in ('MANAGER','ADMIN') or public.is_mode_switcher(actor)) then
    raise exception 'Only active managers and admins can make announcements' using errcode = '42501';
  end if;
  if p_text is null or length(trim(p_text)) not between 1 and 500 then raise exception 'Enter the announcement'; end if;
  if p_date is null then raise exception 'Choose a date'; end if;
  insert into public.calendar_events(organization_id, title, event_date, event_time, created_by, kind)
  values (actor.organization_id, trim(p_text), p_date, p_time, actor.id, 'announcement') returning * into result;
  return result;
end;
$$;
revoke all on function public.add_calendar_announcement(text, date, time) from public, anon;
grant execute on function public.add_calendar_announcement(text, date, time) to authenticated;

commit;
notify pgrst, 'reload schema';
