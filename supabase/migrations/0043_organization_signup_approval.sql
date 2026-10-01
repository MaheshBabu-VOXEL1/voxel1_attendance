-- Route employee sign-up requests to every active manager/admin in the organization.
drop policy if exists "signup_requests_select" on public.signup_requests;
create policy "signup_requests_select" on public.signup_requests for select using (
  public.is_super_admin()
  or employee_id = auth.uid()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);

create or replace function public.signup_request_notify_manager()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  emp record;
begin
  select name, email into emp from public.profiles where id = new.employee_id;
  insert into public.notifications
    (organization_id, user_id, type, title, message, priority, reference_id, reference_type, action_url)
  select new.organization_id, manager.id, 'SYSTEM', 'New employee sign-up',
    coalesce(emp.name, 'Someone') || coalesce(' (' || emp.email || ')', '') ||
      ' requested to join your organization. Approve or reject the request on your dashboard.',
    'HIGH', new.id::text, 'signup_request', 'dashboard'
  from public.profiles manager
  where manager.organization_id = new.organization_id
    and manager.role in ('MANAGER', 'ADMIN')
    and manager.verified = true and manager.status = 'ACTIVE';
  return new;
end;
$$;

create or replace function public.decide_signup_request(p_request uuid, p_approve boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  select * into r from public.signup_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if not (
    public.is_super_admin()
    or (r.organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
  ) then raise exception 'Only a manager in this organization can decide this request'; end if;
  if r.status <> 'PENDING' then raise exception 'This request was already %', lower(r.status); end if;

  update public.signup_requests
    set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
        decided_at = now(), decided_by = auth.uid()
    where id = p_request;

  if p_approve then
    update public.profiles
      set verified = true,
          line_manager_id = case when public.auth_role() = 'MANAGER' then auth.uid() else r.manager_id end
      where id = r.employee_id;
    insert into public.notifications
      (organization_id, user_id, type, title, message, priority, reference_type, action_url)
    values
      (r.organization_id, r.employee_id, 'SYSTEM', 'Welcome aboard',
       'Your account was approved. You can now mark attendance and send your Today Task.',
       'NORMAL', 'signup_request', 'dashboard');
    return 'APPROVED';
  end if;
  return 'REJECTED';
end;
$$;
