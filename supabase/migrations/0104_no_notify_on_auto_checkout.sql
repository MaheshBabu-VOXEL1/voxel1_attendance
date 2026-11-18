-- Auto check-outs must not notify managers.
-- A person checking out themselves still notifies managers/admins ("Employee checked out").
-- The system's own closes (midnight cron "[System: Max Time Reached]" / "[System: Auto-Closed Past Date]",
-- and the app's fallback "[System: Auto-closed — no check-out recorded]") all add a remark starting
-- with "[System:" in the same update, so the trigger skips the check-out notification for those.
create or replace function public.attendance_activity_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare employee text; event_text text;
begin
 if tg_op = 'INSERT' and new.check_in is not null then event_text := 'checked in';
 elsif tg_op = 'UPDATE' and old.check_in is null and new.check_in is not null then event_text := 'checked in';
 elsif tg_op = 'UPDATE' and old.check_out is null and new.check_out is not null then
   if coalesce(new.remarks,'') like '%[System:%' then return new; end if;
   event_text := 'checked out';
 else return new;
 end if;
 select name into employee from profiles where id = public.try_uuid(new.employee_id) and organization_id = new.organization_id;
 perform notify_activity_managers(new.organization_id,'Employee ' || event_text,
   coalesce(employee,'Employee') || ' ' || event_text || '.',new.id::text,'ATTENDANCE');
 return new;
end $$;
