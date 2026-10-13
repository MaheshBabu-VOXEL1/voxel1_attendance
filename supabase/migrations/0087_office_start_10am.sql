-- Voxel1 office starts at 10:00, not 09:00. The saved app_config still said 09:00,
-- so check-ins after 9:15 were marked Late. Grace period (15 min) is unchanged:
-- Late = checked in after 10:15.
begin;
update public.settings
set value = jsonb_set(value::jsonb, '{officeStartTime}', '"10:00"')::text, updated = now()
where key = 'app_config';
commit;
