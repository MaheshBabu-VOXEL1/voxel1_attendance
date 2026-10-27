-- Checking in on a leave day gives that day back.
-- When an employee checks in on a working day that an approved or waiting leave covers,
-- the leave loses that day: a one-day leave is cancelled, a longer one gets one day
-- shorter, so the day returns to the balance. The employee gets a bell notification.
-- Runs as a trigger on attendance, so every check-in path (phone, site, Admin entry) is covered.
-- Each changed leave carries a marker in manager_remarks: [checked in <date>: -1 day, was <STATUS>]
begin;

-- True when a leave would count this date: one of the org's working days and not a holiday.
create or replace function public.leave_counts_day(p_org uuid, p_date date)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare work_days jsonb; hols jsonb;
begin
  select value::jsonb -> 'workingDays' into work_days
  from public.settings where organization_id = p_org and key = 'app_config';
  -- Voxel1 works Monday to Saturday; used when the config has no list.
  if work_days is null or jsonb_typeof(work_days) <> 'array' or jsonb_array_length(work_days) = 0 then
    work_days := '["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]'::jsonb;
  end if;
  if not (work_days ? to_char(p_date, 'FMDay')) then return false; end if;
  select nullif(value, '')::jsonb into hols from public.settings where organization_id = p_org and key = 'holidays';
  return not exists (select 1 from jsonb_array_elements(coalesce(hols, '[]'::jsonb)) h
                     where left(h->>'date', 10) = p_date::text);
end;
$$;
revoke all on function public.leave_counts_day(uuid, date) from public, anon, authenticated;

create or replace function public.checkin_returns_leave_day()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  marker text := '[checked in ' || new.date::text || ': -1 day, was ';
  day_txt text := to_char(new.date, 'DD Mon');
  r record;
  new_days numeric;
  new_status text;
begin
  if new.check_in is null or new.status in ('ABSENT', 'LEAVE', 'HOLIDAY') then return null; end if;
  if tg_op = 'UPDATE' and old.check_in is not null then return null; end if;
  if not public.leave_counts_day(new.organization_id, new.date) then return null; end if;

  -- Same transaction-local pass the holiday recount uses (0097), so the leave guards allow it.
  perform set_config('voxel1.holiday_recount', 'on', true);
  for r in select * from public.leaves
           where organization_id = new.organization_id and employee_id = new.employee_id
             and status in ('APPROVED', 'PENDING_MANAGER', 'PENDING_HR')
             and start_date <= new.date and end_date >= new.date and coalesce(total_days, 0) > 0
             and coalesce(manager_remarks, '') not like '%' || marker || '%'
           for update
  loop
    new_days := greatest(r.total_days - 1, 0);
    new_status := case when new_days = 0 then 'CANCELLED' else r.status end;
    update public.leaves
    set total_days = new_days, status = new_status,
        manager_remarks = concat_ws(' ', nullif(trim(r.manager_remarks), ''), marker || r.status || ']')
    where id = r.id;
    if public.try_uuid(r.employee_id) is not null then
      insert into public.notifications
        (organization_id, user_id, type, title, message, priority, reference_id, reference_type, action_url)
      values (new.organization_id, public.try_uuid(r.employee_id), 'LEAVE', 'Leave day given back',
              case when new_status = 'CANCELLED'
                then 'You checked in on ' || day_txt || ', so your ' || r.type || ' leave for that day was cancelled. The day is back in your balance.'
                else 'You checked in on ' || day_txt || ', so your ' || r.type || ' leave is now ' || trim_scale(new_days)
                     || case when new_days = 1 then ' day' else ' days' end || '. 1 day is back in your balance.' end,
              'NORMAL', r.id::text, 'leave', 'leave');
    end if;
  end loop;
  perform set_config('voxel1.holiday_recount', '', true);
  return null;
end;
$$;
revoke all on function public.checkin_returns_leave_day() from public, anon, authenticated;

drop trigger if exists attendance_checkin_returns_leave on public.attendance;
create trigger attendance_checkin_returns_leave
  after insert or update of check_in on public.attendance
  for each row execute function public.checkin_returns_leave_day();

-- Same as 0097, except a day already given back by a check-in is not taken off again by a
-- holiday added later, nor charged again when that holiday is removed.
create or replace function public.apply_holiday_to_leaves(p_org uuid, p_hol_id text, p_name text,
                                                          p_date date, p_added boolean, p_others integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  work_days jsonb;
  marker text := '[holiday ' || p_hol_id || ': -1 day, was ';
  marker_re text := '\s*\[holiday ' || regexp_replace(p_hol_id, '([^A-Za-z0-9_-])', '\\\1', 'g') || ': -1 day, was ([A-Z_]+)\]';
  day_txt text := to_char(p_date, 'DD Mon');
  r record;
  n integer := 0;
  restored uuid[] := '{}';
  new_days numeric;
  new_status text;
begin
  if p_others > 0 then return 0; end if;
  select value::jsonb -> 'workingDays' into work_days
  from public.settings where organization_id = p_org and key = 'app_config';
  -- Voxel1 works Monday to Saturday; used when the config has no list.
  if work_days is null or jsonb_typeof(work_days) <> 'array' or jsonb_array_length(work_days) = 0 then
    work_days := '["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]'::jsonb;
  end if;
  if not (work_days ? to_char(p_date, 'FMDay')) then return 0; end if;

  perform set_config('voxel1.holiday_recount', 'on', true);

  if p_added then
    for r in select * from public.leaves
             where organization_id = p_org and status in ('APPROVED', 'PENDING_MANAGER', 'PENDING_HR')
               and start_date <= p_date and end_date >= p_date and coalesce(total_days, 0) > 0
               and coalesce(manager_remarks, '') not like '%' || marker || '%'
               and coalesce(manager_remarks, '') not like '%[checked in ' || p_date::text || ':%'
             for update
    loop
      new_days := greatest(r.total_days - 1, 0);
      new_status := case when new_days = 0 then 'CANCELLED' else r.status end;
      update public.leaves
      set total_days = new_days, status = new_status,
          manager_remarks = concat_ws(' ', nullif(trim(r.manager_remarks), ''), marker || r.status || ']')
      where id = r.id;
      if public.try_uuid(r.employee_id) is not null then
        insert into public.notifications
          (organization_id, user_id, type, title, message, priority, reference_id, reference_type, action_url)
        values (p_org, public.try_uuid(r.employee_id), 'LEAVE', 'Holiday added: ' || p_name,
                case when new_status = 'CANCELLED'
                  then day_txt || ' is now a holiday, so your ' || r.type || ' leave for that day was cancelled. The day is back in your balance.'
                  else day_txt || ' is now a holiday, so your ' || r.type || ' leave is now ' || trim_scale(new_days)
                       || case when new_days = 1 then ' day' else ' days' end || '. 1 day is back in your balance.' end,
                'NORMAL', r.id::text, 'leave', 'leave');
      end if;
      n := n + 1;
    end loop;
  else
    -- Leaves this holiday changed: give the day back and restore the old status.
    for r in select l.*, substring(l.manager_remarks from marker_re) as was
             from public.leaves l
             where l.organization_id = p_org and l.start_date <= p_date and l.end_date >= p_date
               and coalesce(l.manager_remarks, '') like '%' || marker || '%'
             for update
    loop
      update public.leaves
      set total_days = coalesce(total_days, 0) + 1,
          status = case when r.status = 'CANCELLED' and r.was in ('APPROVED', 'PENDING_MANAGER', 'PENDING_HR')
                        then r.was else r.status end,
          manager_remarks = nullif(trim(regexp_replace(r.manager_remarks, marker_re, '', 'g')), '')
      where id = r.id;
      restored := restored || r.id;
      n := n + 1;
    end loop;
    -- Leave booked while the holiday stood never counted the day: charge it now.
    for r in select * from public.leaves
             where organization_id = p_org and status in ('APPROVED', 'PENDING_MANAGER', 'PENDING_HR')
               and start_date <= p_date and end_date >= p_date
               and id <> all(restored)
               and coalesce(manager_remarks, '') not like '%[checked in ' || p_date::text || ':%'
             for update
    loop
      update public.leaves set total_days = coalesce(total_days, 0) + 1 where id = r.id;
      n := n + 1;
    end loop;
    if n > 0 then
      insert into public.notifications
        (organization_id, user_id, type, title, message, priority, reference_id, reference_type, action_url)
      select p_org, public.try_uuid(l.employee_id), 'LEAVE', 'Holiday removed: ' || p_name,
             day_txt || ' is a working day again, so your ' || l.type || ' leave counts it ('
               || trim_scale(l.total_days) || case when l.total_days = 1 then ' day' else ' days' end || ').',
             'NORMAL', l.id::text, 'leave', 'leave'
      from public.leaves l
      where l.organization_id = p_org and l.start_date <= p_date and l.end_date >= p_date
        and l.status in ('APPROVED', 'PENDING_MANAGER', 'PENDING_HR')
        and public.try_uuid(l.employee_id) is not null;
    end if;
  end if;

  perform set_config('voxel1.holiday_recount', '', true);
  return n;
end;
$$;
revoke all on function public.apply_holiday_to_leaves(uuid, text, text, date, boolean, integer) from public, anon, authenticated;

commit;
notify pgrst, 'reload schema';
