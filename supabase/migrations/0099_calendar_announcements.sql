-- Manager announcements on the calendar.
-- A manager (or Admin, or an account-switch member in Manager mode) adds an announcement for a date:
-- today shows it to every employee right away, a later date shows it on that day.
-- Announcements live in calendar_events with kind = 'announcement'; delete_calendar_event removes them too.
begin;

alter table public.calendar_events
  add column if not exists kind text not null default 'event';
alter table public.calendar_events drop constraint if exists calendar_events_kind_check;
alter table public.calendar_events add constraint calendar_events_kind_check check (kind in ('event', 'announcement'));
-- Announcements can be longer than an event title.
alter table public.calendar_events drop constraint if exists calendar_events_title_check;
alter table public.calendar_events add constraint calendar_events_title_check check (length(trim(title)) between 1 and 500);

create or replace function public.add_calendar_announcement(p_text text, p_date date)
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
  insert into public.calendar_events(organization_id, title, event_date, created_by, kind)
  values (actor.organization_id, trim(p_text), p_date, actor.id, 'announcement') returning * into result;
  return result;
end;
$$;

revoke all on function public.add_calendar_announcement(text, date) from public, anon;
grant execute on function public.add_calendar_announcement(text, date) to authenticated;

commit;
notify pgrst, 'reload schema';
