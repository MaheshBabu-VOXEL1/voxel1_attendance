-- Keep attendance indefinitely. Apply this to existing deployments too.
-- Preserve the RPC signature so an older Docker scheduler cannot delete data.
begin;
create or replace function public.purge_old_attendance(keep_days integer default 10)
returns integer
language plpgsql security definer set search_path = public as $$
begin
  return 0;
end;
$$;
revoke all on function public.purge_old_attendance(integer) from public, anon, authenticated;
grant execute on function public.purge_old_attendance(integer) to service_role;

do $$
begin
  if to_regclass('cron.job') is not null then
    execute $cmd$select cron.unschedule(jobid) from cron.job where jobname = 'attendance-retention'$cmd$;
  end if;
end;
$$;
commit;
