-- The live demo (demo-login, demo-credentials, demo-reset) was removed:
-- Voxel1 is a single company. Stop the nightly job that rebuilt the demo
-- organization. (Its data was already deleted locally.)
do $$
begin
  if to_regclass('cron.job') is not null then
    begin
      execute 'select cron.unschedule(jobid) from cron.job where jobname = ''demo-reset''';
    exception when others then
      raise notice 'Could not unschedule demo-reset: %', sqlerrm;
    end;
  end if;
end;
$$;
