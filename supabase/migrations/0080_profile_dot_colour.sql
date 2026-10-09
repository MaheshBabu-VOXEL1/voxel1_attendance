-- Manager-board dot colour: ARC blue, MEP green, everyone else grey. dot_colour
-- lets a person be shown in another colour than their discipline gives
-- (Srikanth Gunda is MEP but shown grey). Only Admins / SQL can set it.
begin;
alter table public.profiles add column if not exists dot_colour text
  check (dot_colour in ('blue', 'green', 'grey'));
update public.profiles set dot_colour = 'grey' where public.norm_mobile(mobile) = '7989626574';
commit;
notify pgrst, 'reload schema';
