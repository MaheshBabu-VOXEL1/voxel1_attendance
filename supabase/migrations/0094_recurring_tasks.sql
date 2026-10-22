-- Weekly schedules are independent per root task. Each occurrence retains its own
-- status, clock and comments. Reads materialize due work, even after time offline.
begin;
alter table public.assigned_tasks
  add column recurrence_root_id uuid references public.assigned_tasks(id) on delete set null,
  add column recurrence_days integer[] not null default '{}',
  add column recurrence_next_date date,
  add column occurrence_date date;
create unique index assigned_tasks_recurrence_occurrence
  on public.assigned_tasks(recurrence_root_id, occurrence_date);

-- Deleting the original task stops its schedule but keeps later history honest.
create function public.clear_deleted_task_recurrence()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.id = old.recurrence_root_id then
    update public.assigned_tasks set recurrence_days = '{}', recurrence_next_date = null
      where recurrence_root_id = old.id and id <> old.id;
  end if;
  return old;
end;
$$;
create trigger assigned_tasks_clear_deleted_recurrence before delete on public.assigned_tasks
  for each row execute function public.clear_deleted_task_recurrence();
revoke all on function public.clear_deleted_task_recurrence() from public, anon, authenticated;

create function public.next_task_weekday(p_start date, p_days integer[])
returns date language sql immutable set search_path = public as $$
  select min(p_start + n) from generate_series(0, 6) n
  where extract(dow from p_start + n)::integer = any(p_days)
$$;

create function public.set_task_recurrence(p_task_id uuid, p_days integer[])
returns void language plpgsql security definer set search_path = public as $$
declare actor public.profiles; t public.assigned_tasks; root_id uuid; last_day date;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.role not in ('MANAGER','ADMIN') or actor.status = 'INACTIVE' then
    raise exception 'Only active managers and admins can change recurrence' using errcode = '42501';
  end if;
  if p_days is null or cardinality(p_days) > 7
    or exists(select 1 from unnest(p_days) d where d is null or d < 0 or d > 6) then
    raise exception 'Choose valid weekdays';
  end if;
  select * into t from public.assigned_tasks where id = p_task_id;
  if t.id is null or t.organization_id is distinct from actor.organization_id then
    raise exception 'Task not found' using errcode = '42501';
  end if;
  root_id := coalesce(t.recurrence_root_id, t.id);
  perform 1 from public.assigned_tasks where id = root_id for update;
  if t.recurrence_root_id is null then
    update public.assigned_tasks set recurrence_root_id = id,
      occurrence_date = coalesce(due_date, (now() at time zone 'Asia/Kolkata')::date)
    where id = root_id;
  end if;
  select greatest(max(occurrence_date), (now() at time zone 'Asia/Kolkata')::date)
    into last_day from public.assigned_tasks where recurrence_root_id = root_id;
  update public.assigned_tasks set recurrence_days = array(select distinct d from unnest(p_days) d order by d),
    updated = now() where recurrence_root_id = root_id;
  update public.assigned_tasks set recurrence_next_date = public.next_task_weekday(last_day + 1, p_days)
    where id = root_id;
end;
$$;

create function public.create_recurring_task(p_employee_id uuid, p_description text,
  p_project_name text, p_start_date date, p_days integer[], p_status text default 'NOT_STARTED')
returns public.assigned_tasks language plpgsql security definer set search_path = public as $$
declare result public.assigned_tasks; first_day date;
begin
  if p_days is null or cardinality(p_days) = 0 then raise exception 'Choose at least one weekday'; end if;
  first_day := public.next_task_weekday(coalesce(p_start_date, (now() at time zone 'Asia/Kolkata')::date), p_days);
  if p_employee_id is null then
    result := public.create_unassigned_task(p_description, p_project_name, first_day);
  else
    result := public.assign_employee_task(p_employee_id, p_description, p_project_name, first_day, p_status);
  end if;
  perform public.set_task_recurrence(result.id, p_days);
  -- Catch up from the chosen start date, rather than silently skipping past dates.
  update public.assigned_tasks set recurrence_next_date = public.next_task_weekday(first_day + 1, p_days)
    where id = result.id returning * into result;
  return result;
end;
$$;

create function public.materialize_recurring_tasks()
returns void language plpgsql security definer set search_path = public as $$
declare actor public.profiles; root public.assigned_tasks; source public.assigned_tasks;
  today date := (now() at time zone 'Asia/Kolkata')::date; next_day date;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.status = 'INACTIVE' then
    raise exception 'Sign in to load tasks' using errcode = '42501';
  end if;
  -- Locking plus the unique occurrence index makes concurrent polling idempotent.
  for root in select t.* from public.assigned_tasks t
    where t.id = t.recurrence_root_id and t.organization_id = actor.organization_id
      and t.recurrence_next_date <= today and cardinality(t.recurrence_days) > 0
      and (actor.role in ('MANAGER','ADMIN') or exists (
        select 1 from public.assigned_tasks own where own.recurrence_root_id = t.id and own.employee_id = actor.id))
    order by t.id for update of t
  loop
    select * into source from public.assigned_tasks where recurrence_root_id = root.id
      order by occurrence_date desc, created desc, id desc limit 1;
    next_day := root.recurrence_next_date;
    while next_day <= today loop
      insert into public.assigned_tasks(organization_id, employee_id, assigned_by,
        employee_name, manager_name, description, project_name, due_date, priority,
        recurrence_root_id, recurrence_days, occurrence_date)
      values(root.organization_id, source.employee_id, source.assigned_by,
        source.employee_name, source.manager_name, source.description, source.project_name,
        next_day, source.priority, root.id, root.recurrence_days, next_day)
      on conflict (recurrence_root_id, occurrence_date) do nothing;
      next_day := public.next_task_weekday(next_day + 1, root.recurrence_days);
    end loop;
    update public.assigned_tasks set recurrence_next_date = next_day where id = root.id;
  end loop;
end;
$$;

revoke all on function public.next_task_weekday(date, integer[]) from public, anon, authenticated;
revoke all on function public.set_task_recurrence(uuid, integer[]) from public, anon;
revoke all on function public.create_recurring_task(uuid, text, text, date, integer[], text) from public, anon;
revoke all on function public.materialize_recurring_tasks() from public, anon;
grant execute on function public.set_task_recurrence(uuid, integer[]) to authenticated;
grant execute on function public.create_recurring_task(uuid, text, text, date, integer[], text) to authenticated;
grant execute on function public.materialize_recurring_tasks() to authenticated;
commit;
notify pgrst, 'reload schema';
