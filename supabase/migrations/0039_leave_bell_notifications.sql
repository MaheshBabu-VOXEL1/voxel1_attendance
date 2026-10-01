-- ============================================================
-- Voxel1 — Bell notifications for leave requests
-- 0039_leave_bell_notifications.sql
--
--   * Employee applies           → their line manager gets a notification
--     (no line manager / Admin-only department → every Admin in the org)
--   * Request approved/rejected  → the employee gets a notification,
--     including the approver's remark
--
-- Created by a trigger on public.leaves so it happens for every client
-- and cannot be spoofed from the browser. Also adds public.notifications
-- to the realtime publication so the bell updates without a refresh.
-- ============================================================

-- leaves.employee_id / line_manager_id are text; profiles.id is uuid.
create or replace function public.try_uuid(v text)
returns uuid language sql immutable as $$
  select case
    when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v::uuid
    else null
  end
$$;

create or replace function public.leave_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  dates   text;
  days    text;
  manager uuid;
  remark  text;
begin
  dates := case
    when new.start_date = new.end_date then to_char(new.start_date, 'DD Mon')
    else to_char(new.start_date, 'DD Mon') || ' – ' || to_char(new.end_date, 'DD Mon')
  end;
  days := trim(to_char(coalesce(new.total_days, 1), 'FM999990.##'));
  days := days || case when days = '1' then ' day' else ' days' end;

  -- New request waiting for a decision
  if tg_op = 'INSERT' and new.status in ('PENDING_MANAGER', 'PENDING_HR') then
    manager := public.try_uuid(new.line_manager_id);

    if new.status = 'PENDING_MANAGER' and manager is not null then
      insert into public.notifications
        (organization_id, user_id, type, title, message, priority, reference_id, reference_type, action_url)
      values
        (new.organization_id, manager, 'LEAVE', 'New leave request',
         coalesce(new.employee_name, 'An employee') || ' applied for ' || new.type || ': ' || dates || ' (' || days || ').',
         'NORMAL', new.id::text, 'leave', 'leave');
    else
      insert into public.notifications
        (organization_id, user_id, type, title, message, priority, reference_id, reference_type, action_url)
      select new.organization_id, p.id, 'LEAVE', 'Leave request needs Admin approval',
             coalesce(new.employee_name, 'An employee') || ' applied for ' || new.type || ': ' || dates || ' (' || days || ').',
             'NORMAL', new.id::text, 'leave', 'leave'
      from public.profiles p
      where p.organization_id = new.organization_id
        and p.role in ('ADMIN', 'HR');
    end if;
  end if;

  -- Decision made
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.status in ('APPROVED', 'REJECTED')
     and public.try_uuid(new.employee_id) is not null then
    -- Admin decisions store approver_remarks, manager decisions store manager_remarks
    remark := coalesce(nullif(trim(new.approver_remarks), ''), nullif(trim(new.manager_remarks), ''));
    insert into public.notifications
      (organization_id, user_id, type, title, message, priority, reference_id, reference_type, action_url)
    values
      (new.organization_id, public.try_uuid(new.employee_id), 'LEAVE',
       case when new.status = 'APPROVED' then 'Leave approved' else 'Leave rejected' end,
       'Your ' || new.type || ' (' || dates || ') was ' || lower(new.status) || '.'
         || coalesce(' Remark: ' || remark, ''),
       case when new.status = 'REJECTED' then 'HIGH' else 'NORMAL' end,
       new.id::text, 'leave', 'leave');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_leaves_notify_insert on public.leaves;
create trigger trg_leaves_notify_insert
  after insert on public.leaves
  for each row execute function public.leave_notify();

drop trigger if exists trg_leaves_notify_status on public.leaves;
create trigger trg_leaves_notify_status
  after update of status on public.leaves
  for each row execute function public.leave_notify();

-- Live bell updates (useNotifications subscribes to INSERT/UPDATE on this table)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
