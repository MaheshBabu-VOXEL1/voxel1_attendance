-- Security: lock down what a signed-in user can change directly in the database.
--
-- The row-level policies were written for trusted staff and let anyone in the
-- organization update almost anything. A signed-in employee calling the API
-- directly (skipping the app) could:
--   * make themselves an Admin, or edit anyone's profile (profiles_update)
--   * suspend or rename the whole organization (organizations_update)
--   * edit or approve any leave, including their own (leaves_update/insert)
--   * punch attendance for a colleague, or rewrite their own check-in time,
--     date, status or location after the fact (attendance insert/update)
--   * send notifications to anyone in any organization (notifications_insert)
--
-- Rules below apply to signed-in non-Admins. Admins and server jobs (edge
-- functions, cron: no signed-in user) are unchanged.

-- ── Profiles ────────────────────────────────────────────────────────────────
-- An employee or manager may edit only their own name, photo, emergency
-- contact and location. Role, organization, line manager, mobile (the login
-- key), status, salary, etc. are Admin-only.
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() = 'ADMIN')
  or id = auth.uid()
);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() = 'ADMIN')
);

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  editable constant text[] := array['name', 'avatar', 'emergency_contact', 'location', 'updated'];
begin
  if auth.uid() is null or public.auth_role() = 'ADMIN' then
    return new;
  end if;
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'NOT_ALLOWED: only an Admin can change this part of a profile'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_fields on public.profiles;
create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ── Organization ────────────────────────────────────────────────────────────
drop policy if exists "organizations_update" on public.organizations;
create policy "organizations_update" on public.organizations for update using (
  public.is_super_admin()
  or (id = public.auth_org_id() and public.auth_role() = 'ADMIN')
);

-- ── Leave ───────────────────────────────────────────────────────────────────
-- Who may touch a leave: the Admin, the employee it belongs to, its line manager.
drop policy if exists "leaves_update" on public.leaves;
create policy "leaves_update" on public.leaves for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id()
      and (public.auth_role() = 'ADMIN'
           or employee_id = auth.uid()::text
           or line_manager_id = auth.uid()::text))
);

-- A new request is always the signed-in employee's own, routed to their real
-- line manager, and starts pending (it cannot be created already approved).
create or replace function public.guard_leave_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  manager uuid;
begin
  if auth.uid() is null or public.auth_role() = 'ADMIN' then
    return new;
  end if;
  if new.employee_id is distinct from auth.uid()::text then
    raise exception 'NOT_ALLOWED: you can only apply for your own leave'
      using errcode = '42501';
  end if;
  select line_manager_id into manager from public.profiles where id = auth.uid();
  new.line_manager_id := manager::text;
  new.status := case when manager is null then 'PENDING_HR' else 'PENDING_MANAGER' end;
  new.manager_remarks := null;
  new.approver_remarks := null;
  return new;
end;
$$;

drop trigger if exists leaves_guard_insert on public.leaves;
create trigger leaves_guard_insert
  before insert on public.leaves
  for each row execute function public.guard_leave_insert();

-- Changes: the employee may edit or cancel their request while it is pending;
-- the line manager may only decide it (status + remarks). Nobody but the Admin
-- may move a request to another employee or manager.
create or replace function public.guard_leave_update()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me text := auth.uid()::text;
  decision constant text[] := array['status', 'manager_remarks', 'approver_remarks', 'updated'];
  request_fields constant text[] := array['type', 'start_date', 'end_date', 'total_days', 'reason', 'employee_name', 'status', 'updated'];
begin
  if auth.uid() is null or public.auth_role() = 'ADMIN' then
    return new;
  end if;
  if new.employee_id is distinct from old.employee_id
     or new.line_manager_id is distinct from old.line_manager_id
     or new.organization_id is distinct from old.organization_id then
    raise exception 'NOT_ALLOWED: only an Admin can reassign a leave request'
      using errcode = '42501';
  end if;

  if old.line_manager_id = me and old.employee_id <> me then
    -- The line manager decides.
    if (to_jsonb(new) - decision) is distinct from (to_jsonb(old) - decision) then
      raise exception 'NOT_ALLOWED: a manager can only approve or reject a request'
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

drop trigger if exists leaves_guard_update on public.leaves;
create trigger leaves_guard_update
  before update on public.leaves
  for each row execute function public.guard_leave_update();

-- The approver of an existing request is its stored line manager (not a value
-- supplied in the same update), so it cannot be rerouted and approved at once.
create or replace function public.enforce_leave_decider()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  approver text;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.status not in ('APPROVED', 'REJECTED') then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    approver := nullif(trim(coalesce(old.line_manager_id::text, '')), '');
  else
    approver := nullif(trim(coalesce(new.line_manager_id::text, '')), '');
  end if;

  if approver is not null then
    if approver <> auth.uid()::text then
      raise exception 'LEAVE_DECISION: only the employee''s line manager can approve or reject this leave'
        using errcode = 'P0001';
    end if;
  elsif public.auth_role() <> 'ADMIN' then
    raise exception 'LEAVE_DECISION: only an Admin can approve or reject leave that has no line manager'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ── Attendance ──────────────────────────────────────────────────────────────
-- Only your own attendance; after checking in you may only check out (time,
-- check-out location) and add remarks. Check-in time, date, status and
-- location are fixed once recorded (the Admin corrects them).
drop policy if exists "attendance_update" on public.attendance;
create policy "attendance_update" on public.attendance for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id()
      and (public.auth_role() = 'ADMIN' or employee_id = auth.uid()::text))
);

create or replace function public.guard_attendance_write()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  editable constant text[] := array['check_out', 'check_out_latitude', 'check_out_longitude', 'remarks', 'updated'];
begin
  if auth.uid() is null or public.auth_role() = 'ADMIN' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.employee_id is distinct from auth.uid()::text then
      raise exception 'NOT_ALLOWED: you can only record your own attendance'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'NOT_ALLOWED: only an Admin can change a recorded check-in'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_guard_write on public.attendance;
create trigger attendance_guard_write
  before insert or update on public.attendance
  for each row execute function public.guard_attendance_write();

-- ── Notifications ───────────────────────────────────────────────────────────
-- The app notifies a line manager from the employee's session (late alerts),
-- so signed-in users may create notifications — but only for people in their
-- own organization.
drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications for insert with check (
  public.is_super_admin()
  or (auth.uid() is not null
      and organization_id = public.auth_org_id()
      and exists (select 1 from public.profiles p
                  where p.id = user_id and p.organization_id = public.auth_org_id()))
);
