-- Attendance punches are allowed only within 600 metres of the Grava site pin.
-- Retain the existing trigger and its admin/system correction exceptions.
-- Ignore officeLocations settings so older offices cannot authorize a punch.
create or replace function public.within_office(org uuid, lat double precision, lng double precision)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    lat between -90 and 90
    and lng between -180 and 180
    and public.distance_m(lat, lng, 17.3975051, 78.3157152) <= 600,
    false
  );
$$;
