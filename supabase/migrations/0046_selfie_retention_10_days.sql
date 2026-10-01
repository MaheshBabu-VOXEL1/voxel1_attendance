-- One platform-wide retention period for attendance selfies.
update public.settings
set value = '10', updated = now()
where organization_id is null and key = 'selfie_retention_days';

insert into public.settings (organization_id, key, value)
select null, 'selfie_retention_days', '10'
where not exists (
  select 1 from public.settings
  where organization_id is null and key = 'selfie_retention_days'
);

-- The old SQL-only job discarded database paths without deleting files.
-- It is superseded by the Storage-aware edge function schedule.
do $$
begin
  if to_regclass('cron.job') is not null then
    begin
      execute 'select cron.unschedule(jobid) from cron.job where jobname = ''selfie-cleanup''';
    exception when others then
      raise notice 'Could not unschedule old selfie-cleanup job: %', sqlerrm;
    end;
  end if;
end;
$$;

-- Self-hosted Storage needs table privileges in addition to its RLS policies.
-- Grant only the operations required for authenticated uploads and cleanup.
grant usage on schema storage to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
grant select, insert on storage.objects to authenticated;
grant select, insert, update, delete on storage.objects to service_role;
