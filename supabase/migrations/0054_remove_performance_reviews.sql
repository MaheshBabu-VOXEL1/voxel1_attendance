-- Performance reviews were removed from the app. Stop the daily job that opened
-- and closed review cycles (its edge function, cron-review-transitions, is gone).
-- Review data (review_cycles, performance_reviews) is kept, just no longer used.
do $$
begin
  if to_regclass('cron.job') is not null then
    begin
      execute 'select cron.unschedule(jobid) from cron.job where jobname = ''review-cycle-transition''';
    exception when others then
      raise notice 'Could not unschedule review-cycle-transition: %', sqlerrm;
    end;
  end if;
end;
$$;

delete from public.settings where key = 'review_config';
