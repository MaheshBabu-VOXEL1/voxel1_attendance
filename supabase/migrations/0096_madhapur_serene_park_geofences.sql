-- Restore Madhapur and add the supplied Aparna Serene Park map location.
create or replace function public.within_office(org uuid, lat double precision, lng double precision)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    lat between -90 and 90
    and lng between -180 and 180
    and (
      public.distance_m(lat, lng, 17.3975051, 78.3157152) <= 800
      or public.distance_m(lat, lng, 17.4484603, 78.3828482) <= 200
      or public.distance_m(lat, lng, 17.445888, 78.397484) <= 200
      or public.distance_m(lat, lng, 17.4629594, 78.3380491) <= 200
    ),
    false
  );
$$;
