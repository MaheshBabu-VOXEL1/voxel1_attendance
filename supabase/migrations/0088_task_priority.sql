-- Task priority and manager control of deadlines.
-- priority: HIGH / MEDIUM / LOW (default MEDIUM); the board lists High first.
-- Any active manager (Manager mode included) or admin may change a task's priority and
-- due date, not only the manager who created it, so overdue work can be re-planned.
-- Every move of an existing deadline is counted (due_changes, due_changed_by, due_changed_at).
begin;
alter table public.assigned_tasks
  add column if not exists priority text not null default 'MEDIUM' check (priority in ('HIGH','MEDIUM','LOW')),
  add column if not exists due_changes smallint not null default 0,
  add column if not exists due_changed_by uuid references public.profiles(id) on delete set null,
  add column if not exists due_changed_at timestamptz;

create index if not exists assigned_tasks_org_priority_idx on public.assigned_tasks (organization_id, priority, due_date);

create or replace function public.track_task_due_change()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.due_date is not null and new.due_date is distinct from old.due_date then
    new.due_changes := least(coalesce(old.due_changes, 0) + 1, 32767);
    new.due_changed_by := auth.uid();
    new.due_changed_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists assigned_tasks_track_due_change on public.assigned_tasks;
create trigger assigned_tasks_track_due_change before update on public.assigned_tasks
  for each row execute function public.track_task_due_change();

-- Priority, due date and half-day mark in one call.
create or replace function public.manager_set_task_plan(p_task_id uuid, p_priority text, p_due_date date, p_half_day boolean)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; t public.assigned_tasks; result public.assigned_tasks;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
    raise exception 'Only active managers and admins can change priority or deadline' using errcode = '42501';
  end if;
  select * into t from public.assigned_tasks where id = p_task_id for update;
  if t.id is null or t.organization_id is distinct from actor.organization_id then
    raise exception 'Task not found' using errcode = '42501';
  end if;
  if p_priority is null or p_priority not in ('HIGH','MEDIUM','LOW') then
    raise exception 'Choose High, Medium or Low priority';
  end if;
  if coalesce(p_half_day, false) and p_due_date is null then
    raise exception 'A half-day task needs a due date';
  end if;
  update public.assigned_tasks set priority = p_priority, due_date = p_due_date, updated = now()
  where id = t.id;
  -- Separate step: clear_task_half_day resets half_day whenever the date moves.
  update public.assigned_tasks set half_day = coalesce(p_half_day, false)
  where id = t.id returning * into result;
  return result;
end;
$$;
revoke all on function public.manager_set_task_plan(uuid, text, date, boolean) from public, anon;
grant execute on function public.manager_set_task_plan(uuid, text, date, boolean) to authenticated;

commit;
notify pgrst, 'reload schema';
