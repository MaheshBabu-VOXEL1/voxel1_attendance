-- Only the line manager approves or rejects an employee's leave.
--
-- The leaves update policy lets anyone in the organization update any leave,
-- so the app alone decided who could approve. This trigger decides it in the
-- database: a leave with a line manager can be APPROVED or REJECTED only by
-- that manager; a leave with no line manager (the manager's own leave) only by
-- an Admin. It applies both to changing a request and to creating one already
-- decided. Server jobs (no signed-in user) are not checked. Everything else
-- about a leave (an employee cancelling, an Admin fixing dates) is unchanged.

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

  approver := nullif(trim(coalesce(new.line_manager_id::text, case when tg_op = 'UPDATE' then old.line_manager_id::text end, '')), '');

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

drop trigger if exists leaves_only_manager_decides on public.leaves;
create trigger leaves_only_manager_decides
  before insert or update on public.leaves
  for each row execute function public.enforce_leave_decider();
