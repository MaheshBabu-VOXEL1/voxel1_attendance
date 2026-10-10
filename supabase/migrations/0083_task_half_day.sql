-- Half-day tasks: the manager's add-task bar offers Half Day / Today / Tomorrow.
-- Half Day = due today, finished within half a day. half_day marks it so the
-- board shows "Half day" instead of "Today". Changing the due date clears it.
begin;
alter table public.assigned_tasks add column if not exists half_day boolean not null default false;

create or replace function public.clear_task_half_day()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.due_date is distinct from old.due_date and new.half_day = old.half_day then
    new.half_day := false;
  end if;
  return new;
end;
$$;
drop trigger if exists assigned_tasks_clear_half_day on public.assigned_tasks;
create trigger assigned_tasks_clear_half_day before update on public.assigned_tasks
  for each row execute function public.clear_task_half_day();

-- Same rule as manager_update_task: only the active manager who created the task.
create or replace function public.set_task_half_day(p_task_id uuid, p_half_day boolean)
returns public.assigned_tasks
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; t public.assigned_tasks; result public.assigned_tasks;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
    raise exception 'Only active managers and admins can edit tasks' using errcode = '42501';
  end if;
  select * into t from public.assigned_tasks where id = p_task_id for update;
  if t.id is null or t.organization_id is distinct from actor.organization_id or t.assigned_by <> actor.id or t.self_created then
    raise exception 'You can edit only tasks you created' using errcode = '42501';
  end if;
  if coalesce(p_half_day, false) and t.due_date is null then
    raise exception 'A half-day task needs a due date';
  end if;
  update public.assigned_tasks set half_day = coalesce(p_half_day, false), updated = now()
  where id = t.id returning * into result;
  return result;
end;
$$;
revoke all on function public.set_task_half_day(uuid, boolean) from public, anon;
grant execute on function public.set_task_half_day(uuid, boolean) to authenticated;
commit;
notify pgrst, 'reload schema';
