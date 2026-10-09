-- The six account-switch members, while in Manager mode, may approve or reject
-- leave like the line manager (Kesari) — never their own leave.
begin;

create or replace function public.is_leave_co_decider()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'MANAGER' and public.is_mode_switcher(p)
                   from public.profiles p where p.id = auth.uid()), false);
$$;
revoke all on function public.is_leave_co_decider() from public, anon;
grant execute on function public.is_leave_co_decider() to authenticated;

drop policy if exists "leaves_update" on public.leaves;
create policy "leaves_update" on public.leaves for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id()
      and (public.auth_role() = 'ADMIN'
           or employee_id = auth.uid()::text
           or line_manager_id = auth.uid()::text
           or public.is_leave_co_decider()))
);

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

  if (old.line_manager_id = me or public.is_leave_co_decider()) and old.employee_id <> me then
    -- The line manager (or a member in Manager mode) decides.
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
    if approver <> auth.uid()::text
       and not (tg_op = 'UPDATE' and public.is_leave_co_decider() and old.employee_id <> auth.uid()::text) then
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

commit;
notify pgrst, 'reload schema';
