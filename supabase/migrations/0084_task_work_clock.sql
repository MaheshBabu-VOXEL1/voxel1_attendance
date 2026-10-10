-- Work clock for tasks: counts only the time a task is running (Start / In progress).
-- Pause, Stuck and Done stop the clock; Start again continues it. Half-day tasks
-- turn overdue once worked_seconds (+ the running stretch) passes 4 h 30 min.
-- Kept by a trigger, so every path (employee status, manager edit) keeps it right,
-- and a manager edit no longer restarts the half-day timer.
begin;
alter table public.assigned_tasks
  add column if not exists worked_seconds integer not null default 0,
  add column if not exists work_resumed_at timestamptz;

-- Tasks running right now (set before the trigger exists, which would keep the old value).
drop trigger if exists assigned_tasks_work_clock on public.assigned_tasks;
update public.assigned_tasks set work_resumed_at = coalesce(started_at, now())
where status in ('START','PROGRESS') and work_resumed_at is null;

create or replace function public.track_task_work_clock()
returns trigger language plpgsql set search_path = public as $$
declare was_running boolean; is_running boolean := new.status in ('START','PROGRESS');
begin
  if tg_op = 'INSERT' then
    new.worked_seconds := 0;
    new.work_resumed_at := case when is_running then now() else null end;
    return new;
  end if;
  was_running := old.status in ('START','PROGRESS');
  -- the clock columns are written only here
  new.worked_seconds := old.worked_seconds;
  new.work_resumed_at := old.work_resumed_at;
  if was_running and not is_running then
    new.worked_seconds := old.worked_seconds
      + greatest(0, floor(extract(epoch from now() - coalesce(old.work_resumed_at, now()))))::integer;
    new.work_resumed_at := null;
  elsif is_running and not was_running then
    new.work_resumed_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists assigned_tasks_work_clock on public.assigned_tasks;
create trigger assigned_tasks_work_clock before insert or update on public.assigned_tasks
  for each row execute function public.track_task_work_clock();

commit;
notify pgrst, 'reload schema';
