-- A holiday added in the manager calendar now also fixes leave that already exists.
--   * Add:    every approved or pending leave covering that working day loses one day
--             (cancelled when nothing is left), so the day goes back to the balance.
--   * Remove: the leaves it changed get the day back (a leave it cancelled is restored
--             to its old status), and leave covering the day is charged for it again.
-- Leave applied after a holiday is added already skips it (the apply screens exclude
-- holidays), so the only gap was a holiday added late, like 19 Oct 2026.
-- Each changed leave carries a marker in manager_remarks: [holiday <id>: -1 day, was <STATUS>]
-- Also: account-switch members (stored as EMPLOYEE, e.g. Kesari) can now add and remove
-- holidays and events from the manager calendar; before, the functions refused them.
begin;

-- ---------- a transaction-local pass for the leave guards ----------
-- Set only inside apply_holiday_to_leaves below; clients cannot reach set_config through the API.
create or replace function public.holiday_recount_active()
returns boolean language sql stable set search_path = public as $$
  select coalesce(current_setting('voxel1.holiday_recount', true), '') = 'on';
$$;
revoke all on function public.holiday_recount_active() from public, anon, authenticated;

-- Same as 0085, plus the holiday pass on the first line.
create or replace function public.guard_leave_update()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me text := auth.uid()::text;
  decision constant text[] := array['status', 'manager_remarks', 'approver_remarks', 'updated'];
  request_fields constant text[] := array['type', 'start_date', 'end_date', 'total_days', 'reason', 'employee_name', 'status', 'updated'];
begin
  if auth.uid() is null or public.auth_role() = 'ADMIN' or public.holiday_recount_active() then
    return new;
  end if;
  if new.employee_id is distinct from old.employee_id
     or new.line_manager_id is distinct from old.line_manager_id
     or new.organization_id is distinct from old.organization_id then
    raise exception 'NOT_ALLOWED: only an Admin can reassign a leave request'
      using errcode = '42501';
  end if;

  if public.is_leave_approver() then
    if old.employee_id = me then
      -- The approver decides their own leave and may still edit or cancel it.
      if (to_jsonb(new) - decision - request_fields) is distinct from (to_jsonb(old) - decision - request_fields) then
        raise exception 'NOT_ALLOWED: only the request details or the decision can change'
          using errcode = '42501';
      end if;
    elsif (to_jsonb(new) - decision) is distinct from (to_jsonb(old) - decision) then
      raise exception 'NOT_ALLOWED: the approver can only approve or reject a request'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.employee_id = me then
    if old.status not in ('PENDING_MANAGER', 'PENDING_HR') then
      raise exception 'NOT_ALLOWED: this request has already been decided'
        using errcode = '42501';
    end if;
    if new.status not in (old.status, 'CANCELLED') then
      raise exception 'NOT_ALLOWED: you can only cancel your own request'
        using errcode = '42501';
    end if;
    if (to_jsonb(new) - request_fields) is distinct from (to_jsonb(old) - request_fields) then
      raise exception 'NOT_ALLOWED: you can only change the details of your own request'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'NOT_ALLOWED' using errcode = '42501';
end;
$$;

-- Same as 0085, plus the holiday pass (restoring a leave the holiday had cancelled).
create or replace function public.enforce_leave_decider()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.holiday_recount_active() then
    return new;
  end if;
  if new.status not in ('APPROVED', 'REJECTED') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if public.auth_role() = 'ADMIN' or public.is_leave_approver() then
    return new;
  end if;
  raise exception 'LEAVE_DECISION: only Maruthi can approve or reject leave'
    using errcode = 'P0001';
end;
$$;

-- Same as 0091, plus the holiday pass (giving a day back never breaks the limit on purpose).
create or replace function public.enforce_unpaid_leave_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim numeric; used numeric; emp uuid; yr integer;
begin
  if new.type is distinct from 'UNPAID' or new.status not in ('PENDING_MANAGER','PENDING_HR','APPROVED') then
    return new;
  end if;
  -- A decision (approve) on a request that was already counted is not re-checked.
  if tg_op = 'UPDATE' and old.type = 'UNPAID' and old.status in ('PENDING_MANAGER','PENDING_HR','APPROVED')
     and old.start_date = new.start_date and old.total_days is not distinct from new.total_days then
    return new;
  end if;
  -- Maruthi and Admin control the limit, so they may enter leave beyond it.
  if auth.uid() is null or public.auth_role() = 'ADMIN' or public.is_leave_approver()
     or public.holiday_recount_active() then
    return new;
  end if;
  begin emp := new.employee_id::uuid; exception when others then return new; end;
  lim := public.unpaid_limit_for(new.organization_id, emp);
  if lim is null then return new; end if;
  yr := extract(year from new.start_date)::integer;
  used := public.unpaid_days_used(new.organization_id, new.employee_id, yr, case when tg_op = 'UPDATE' then new.id end);
  if used + coalesce(new.total_days, 0) > lim then
    raise exception 'UNPAID_LIMIT: only % of % unpaid leave days left in %. Ask Maruthi to raise your limit.',
      trim_scale(greatest(lim - used, 0)), trim_scale(lim), yr using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------- the recount ----------
-- p_added true: the holiday was just added; false: it was just removed.
-- p_others: how many other holidays are on that date (then leave never counted the day anyway).
-- Returns how many leaves changed.
create or replace function public.apply_holiday_to_leaves(p_org uuid, p_hol_id text, p_name text,
                                                          p_date date, p_added boolean, p_others integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  work_days jsonb;
  marker text := '[holiday ' || p_hol_id || ': -1 day, was ';
  marker_re text := '\s*\[holiday ' || regexp_replace(p_hol_id, '([^A-Za-z0-9_-])', '\\\1', 'g') || ': -1 day, was ([A-Z_]+)\]';
  day_txt text := to_char(p_date, 'DD Mon');
  r record;
  n integer := 0;
  restored uuid[] := '{}';
  new_days numeric;
  new_status text;
begin
  if p_others > 0 then return 0; end if;
  select value::jsonb -> 'workingDays' into work_days
  from public.settings where organization_id = p_org and key = 'app_config';
  -- Voxel1 works Monday to Saturday; used when the config has no list.
  if work_days is null or jsonb_typeof(work_days) <> 'array' or jsonb_array_length(work_days) = 0 then
    work_days := '["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]'::jsonb;
  end if;
  if not (work_days ? to_char(p_date, 'FMDay')) then return 0; end if;

  perform set_config('voxel1.holiday_recount', 'on', true);

  if p_added then
    for r in select * from public.leaves
             where organization_id = p_org and status in ('APPROVED', 'PENDING_MANAGER', 'PENDING_HR')
               and start_date <= p_date and end_date >= p_date and coalesce(total_days, 0) > 0
               and coalesce(manager_remarks, '') not like '%' || marker || '%'
             for update
    loop
      new_days := greatest(r.total_days - 1, 0);
      new_status := case when new_days = 0 then 'CANCELLED' else r.status end;
      update public.leaves
      set total_days = new_days, status = new_status,
          manager_remarks = concat_ws(' ', nullif(trim(r.manager_remarks), ''), marker || r.status || ']')
      where id = r.id;
      if public.try_uuid(r.employee_id) is not null then
        insert into public.notifications
          (organization_id, user_id, type, title, message, priority, reference_id, reference_type, action_url)
        values (p_org, public.try_uuid(r.employee_id), 'LEAVE', 'Holiday added: ' || p_name,
                case when new_status = 'CANCELLED'
                  then day_txt || ' is now a holiday, so your ' || r.type || ' leave for that day was cancelled. The day is back in your balance.'
                  else day_txt || ' is now a holiday, so your ' || r.type || ' leave is now ' || trim_scale(new_days)
                       || case when new_days = 1 then ' day' else ' days' end || '. 1 day is back in your balance.' end,
                'NORMAL', r.id::text, 'leave', 'leave');
      end if;
      n := n + 1;
    end loop;
  else
    -- Leaves this holiday changed: give the day back and restore the old status.
    for r in select l.*, substring(l.manager_remarks from marker_re) as was
             from public.leaves l
             where l.organization_id = p_org and l.start_date <= p_date and l.end_date >= p_date
               and coalesce(l.manager_remarks, '') like '%' || marker || '%'
             for update
    loop
      update public.leaves
      set total_days = coalesce(total_days, 0) + 1,
          status = case when r.status = 'CANCELLED' and r.was in ('APPROVED', 'PENDING_MANAGER', 'PENDING_HR')
                        then r.was else r.status end,
          manager_remarks = nullif(trim(regexp_replace(r.manager_remarks, marker_re, '', 'g')), '')
      where id = r.id;
      restored := restored || r.id;
      n := n + 1;
    end loop;
    -- Leave booked while the holiday stood never counted the day: charge it now.
    for r in select * from public.leaves
             where organization_id = p_org and status in ('APPROVED', 'PENDING_MANAGER', 'PENDING_HR')
               and start_date <= p_date and end_date >= p_date
               and id <> all(restored)
             for update
    loop
      update public.leaves set total_days = coalesce(total_days, 0) + 1 where id = r.id;
      n := n + 1;
    end loop;
    if n > 0 then
      insert into public.notifications
        (organization_id, user_id, type, title, message, priority, reference_id, reference_type, action_url)
      select p_org, public.try_uuid(l.employee_id), 'LEAVE', 'Holiday removed: ' || p_name,
             day_txt || ' is a working day again, so your ' || l.type || ' leave counts it ('
               || trim_scale(l.total_days) || case when l.total_days = 1 then ' day' else ' days' end || ').',
             'NORMAL', l.id::text, 'leave', 'leave'
      from public.leaves l
      where l.organization_id = p_org and l.start_date <= p_date and l.end_date >= p_date
        and l.status in ('APPROVED', 'PENDING_MANAGER', 'PENDING_HR')
        and public.try_uuid(l.employee_id) is not null;
    end if;
  end if;

  perform set_config('voxel1.holiday_recount', '', true);
  return n;
end;
$$;
revoke all on function public.apply_holiday_to_leaves(uuid, text, text, date, boolean, integer) from public, anon, authenticated;

-- ---------- holidays now return how many leaves they changed ----------
drop function if exists public.add_org_holiday(text, date);
create function public.add_org_holiday(p_name text, p_date date)
returns integer
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; hol jsonb; cur jsonb; others integer;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.status = 'INACTIVE'
     or not (actor.role in ('MANAGER','ADMIN') or public.is_mode_switcher(actor)) then
    raise exception 'Only active managers and admins can add holidays' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 200 then raise exception 'Enter a holiday name'; end if;
  if p_date is null then raise exception 'Choose a date'; end if;
  hol := jsonb_build_object('id', 'h-' || gen_random_uuid(), 'date', p_date::text, 'name', trim(p_name),
                            'isGovernment', false, 'type', 'FESTIVAL');
  select coalesce(nullif(value, '')::jsonb, '[]'::jsonb) into cur
  from public.settings where organization_id = actor.organization_id and key = 'holidays' for update;
  if found then
    update public.settings set value = (cur || jsonb_build_array(hol))::text
    where organization_id = actor.organization_id and key = 'holidays';
  else
    cur := '[]'::jsonb;
    insert into public.settings(organization_id, key, value) values (actor.organization_id, 'holidays', jsonb_build_array(hol)::text);
  end if;
  select count(*) into others from jsonb_array_elements(cur) h where left(h->>'date', 10) = p_date::text;
  return public.apply_holiday_to_leaves(actor.organization_id, hol->>'id', trim(p_name), p_date, true, others);
end;
$$;

drop function if exists public.delete_org_holiday(text);
create function public.delete_org_holiday(p_id text)
returns integer
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; cur jsonb; kept jsonb; gone jsonb; others integer;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.status = 'INACTIVE'
     or not (actor.role in ('MANAGER','ADMIN') or public.is_mode_switcher(actor)) then
    raise exception 'Only active managers and admins can remove holidays' using errcode = '42501';
  end if;
  select value::jsonb into cur from public.settings where organization_id = actor.organization_id and key = 'holidays' for update;
  -- Government holidays stay; only company-added ones can be removed here.
  select h into gone from jsonb_array_elements(coalesce(cur, '[]'::jsonb)) h
  where h->>'id' = p_id and coalesce((h->>'isGovernment')::boolean, false) = false limit 1;
  if gone is null then
    raise exception 'Holiday not found, or it is a government holiday';
  end if;
  select coalesce(jsonb_agg(h), '[]'::jsonb) into kept from jsonb_array_elements(cur) h where h->>'id' is distinct from p_id;
  update public.settings set value = kept::text where organization_id = actor.organization_id and key = 'holidays';
  select count(*) into others from jsonb_array_elements(kept) h where left(h->>'date', 10) = left(gone->>'date', 10);
  return public.apply_holiday_to_leaves(actor.organization_id, p_id, gone->>'name', left(gone->>'date', 10)::date, false, others);
end;
$$;

-- ---------- events: account-switch members (role EMPLOYEE, e.g. Kesari) were refused too ----------
create or replace function public.add_calendar_event(p_title text, p_date date)
returns public.calendar_events
language plpgsql security definer set search_path = public as $$
declare actor public.profiles; result public.calendar_events;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.status = 'INACTIVE'
     or not (actor.role in ('MANAGER','ADMIN') or public.is_mode_switcher(actor)) then
    raise exception 'Only active managers and admins can add events' using errcode = '42501';
  end if;
  if p_title is null or length(trim(p_title)) not between 1 and 200 then raise exception 'Enter a title'; end if;
  if p_date is null then raise exception 'Choose a date'; end if;
  insert into public.calendar_events(organization_id, title, event_date, created_by)
  values (actor.organization_id, trim(p_title), p_date, actor.id) returning * into result;
  return result;
end;
$$;

create or replace function public.delete_calendar_event(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare actor public.profiles;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.status = 'INACTIVE'
     or not (actor.role in ('MANAGER','ADMIN') or public.is_mode_switcher(actor)) then
    raise exception 'Only active managers and admins can remove events' using errcode = '42501';
  end if;
  delete from public.calendar_events where id = p_id and organization_id = actor.organization_id;
  if not found then raise exception 'Event not found'; end if;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['add_org_holiday(text,date)', 'delete_org_holiday(text)',
                           'add_calendar_event(text,date)', 'delete_calendar_event(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;
notify pgrst, 'reload schema';
