-- Server-side geofence for attendance punches.
--
-- The app only enables Check In / Check Out within an office's radius, but that
-- check ran on the phone alone. These triggers repeat it in the database, so a
-- modified app or a direct API call cannot punch from outside an office.
--
-- Offices come from the organization's app_config setting (officeLocations:
-- [{ name, lat, lng, radius }]). Each office uses its own radius in metres; a
-- missing or non-positive radius means 200 m. With no office configured, the
-- app's built-in office is used, mirroring OFFICE_LOCATIONS in src/constants.tsx.
--
-- Checked: an employee's own check-in (insert) and own check-out (setting
-- check_out on their open record, using the new check_out_latitude/longitude).
-- Not checked: Admins (they may correct any record), server jobs (no signed-in
-- user), and the app's own closing of a forgotten check-out from an earlier day
-- (workdaySessionManager, remark "[System: Auto-closed — no check-out recorded]").

alter table public.attendance
  add column if not exists check_out_latitude  double precision,
  add column if not exists check_out_longitude double precision;

-- Great-circle distance in metres (haversine), matching useGeoLocation.ts.
create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision
language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- The organization's app_config as jsonb (null when missing or unreadable).
create or replace function public.org_app_config(org uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  cfg jsonb;
begin
  select value::jsonb into cfg
  from public.settings
  where organization_id = org and key = 'app_config'
  limit 1;
  return cfg;
exception when others then
  return null;
end;
$$;

-- True when (lat, lng) is within the radius of one of the organization's offices.
create or replace function public.within_office(org uuid, lat double precision, lng double precision)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  offices jsonb := public.org_app_config(org) -> 'officeLocations';
  office jsonb;
  radius double precision;
begin
  if lat is null or lng is null or (lat = 0 and lng = 0) then
    return false;
  end if;
  if offices is null or jsonb_typeof(offices) <> 'array' or jsonb_array_length(offices) = 0 then
    offices := '[{"lat": 17.445888, "lng": 78.397484, "radius": 200}]'::jsonb;
  end if;
  for office in select * from jsonb_array_elements(offices) loop
    begin
      radius := coalesce(nullif((office ->> 'radius')::double precision, 0), 200);
      if radius < 0 then radius := 200; end if;
      if public.distance_m(lat, lng, (office ->> 'lat')::double precision, (office ->> 'lng')::double precision) <= radius then
        return true;
      end if;
    exception when others then
      -- A malformed office entry is skipped, not fatal.
      null;
    end;
  end loop;
  return false;
end;
$$;

create or replace function public.enforce_attendance_geofence()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tz text;
  org_today date;
begin
  -- Server jobs (no signed-in user) and Admins are not checked.
  if auth.uid() is null or public.auth_role() in ('ADMIN', 'SUPER_ADMIN') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.employee_id = auth.uid()::text
       and not public.within_office(new.organization_id, new.latitude, new.longitude) then
      raise exception 'OUTSIDE_OFFICE: check-in must be made within an office radius'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE: only the moment an employee closes their own open record.
  if old.employee_id = auth.uid()::text and old.check_out is null and new.check_out is not null then
    -- The app closing a forgotten check-out from an earlier day (org-local date).
    if coalesce(new.remarks, '') like '%[System: Auto-closed — no check-out recorded]%' then
      tz := public.org_app_config(old.organization_id) ->> 'timezone';
      begin
        org_today := (now() at time zone coalesce(nullif(tz, ''), 'UTC'))::date;
      exception when others then
        org_today := (now() at time zone 'UTC')::date;
      end;
      if old.date < org_today then
        return new;
      end if;
    end if;

    if not public.within_office(old.organization_id, new.check_out_latitude, new.check_out_longitude) then
      raise exception 'OUTSIDE_OFFICE: check-out must be made within an office radius'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_geofence on public.attendance;
create trigger attendance_geofence
  before insert or update on public.attendance
  for each row execute function public.enforce_attendance_geofence();
