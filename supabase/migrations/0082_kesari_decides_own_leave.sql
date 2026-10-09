-- Kesari (7700901979) approves Kesari's own leave: Kesari becomes their own
-- line manager, and a person who is their own line manager may decide their
-- own leave. Nobody else can approve their own leave.
begin;

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

  if old.employee_id = me and old.line_manager_id = me then
    -- Someone who is their own line manager (Kesari) decides their own leave,
    -- and may still edit or cancel it like any other request of theirs.
    if (to_jsonb(new) - decision - request_fields) is distinct from (to_jsonb(old) - decision - request_fields) then
      raise exception 'NOT_ALLOWED: only the request details or the decision can change'
        using errcode = '42501';
    end if;
    return new;
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

update public.profiles set line_manager_id = id where public.norm_mobile(mobile) = '7700901979';
update public.leaves l set line_manager_id = p.id::text
  from public.profiles p
 where public.norm_mobile(p.mobile) = '7700901979' and l.employee_id = p.id::text
   and l.status in ('PENDING_MANAGER', 'PENDING_HR');
update public.leaves l set status = 'PENDING_MANAGER'
  from public.profiles p
 where public.norm_mobile(p.mobile) = '7700901979' and l.employee_id = p.id::text and l.status = 'PENDING_HR';

commit;
notify pgrst, 'reload schema';
