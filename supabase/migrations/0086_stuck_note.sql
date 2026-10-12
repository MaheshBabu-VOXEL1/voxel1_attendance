-- Stuck note: marking a task Stuck needs how much is done (%) and why it is stuck,
-- so the manager can plan the next day. The note is cleared when the task leaves Stuck.
begin;
alter table public.assigned_tasks
  add column if not exists stuck_progress smallint check (stuck_progress between 0 and 100),
  add column if not exists stuck_reason text,
  add column if not exists stuck_at timestamptz;

create or replace function public.require_stuck_note()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'STUCK' and old.status is distinct from 'STUCK'
     and (coalesce(trim(new.stuck_reason), '') = '' or new.stuck_progress is null) then
    raise exception 'STUCK_NOTE: say how much is done and why the task is stuck' using errcode = 'P0001';
  end if;
  if new.status <> 'STUCK' then
    new.stuck_progress := null; new.stuck_reason := null; new.stuck_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists assigned_tasks_require_stuck_note on public.assigned_tasks;
create trigger assigned_tasks_require_stuck_note before update on public.assigned_tasks
  for each row execute function public.require_stuck_note();

-- The assignee, or the manager who created the task, marks it Stuck with the note.
create or replace function public.mark_task_stuck(p_task_id uuid, p_progress integer, p_reason text)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; t public.assigned_tasks; result public.assigned_tasks;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.status = 'INACTIVE' then
    raise exception 'Sign in again to update this task' using errcode = '42501';
  end if;
  select * into t from public.assigned_tasks where id = p_task_id for update;
  if t.id is null or t.organization_id is distinct from actor.organization_id
     or not (t.employee_id = actor.id
             or (t.assigned_by = actor.id and not t.self_created and actor.role in ('MANAGER','ADMIN'))) then
    raise exception 'You can update only your own or your assigned tasks' using errcode = '42501';
  end if;
  if p_progress is null or p_progress not between 0 and 100 then
    raise exception 'Choose how much of the task is done';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 1000 then
    raise exception 'Write why the task is stuck (3 to 1000 characters)';
  end if;
  update public.assigned_tasks set
    status = 'STUCK', stuck_progress = p_progress, stuck_reason = trim(p_reason), stuck_at = now(),
    completed_at = null, updated = now()
  where id = t.id returning * into result;
  return result;
end;
$$;
revoke all on function public.mark_task_stuck(uuid, integer, text) from public, anon;
grant execute on function public.mark_task_stuck(uuid, integer, text) to authenticated;

commit;
notify pgrst, 'reload schema';
