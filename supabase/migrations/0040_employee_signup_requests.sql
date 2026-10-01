-- ============================================================
-- Voxel1 — Employee self sign-up, approved by their manager
-- 0040_employee_signup_requests.sql
--
-- An employee signs up with their manager's email (edge function
-- `employee-signup`). Their account is created unverified inside the
-- manager's organization with that manager as line manager, and a
-- request row is added here. They cannot log in (auth.service checks
-- profiles.verified) until the manager approves on their dashboard.
--
-- Decisions go through decide_signup_request(), which checks that the
-- caller is that request's manager (or an Admin of the organization).
-- Clients cannot insert or update requests directly.
-- ============================================================

create table if not exists public.signup_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  manager_id      uuid not null references public.profiles(id) on delete cascade,
  status          text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  created         timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid references public.profiles(id) on delete set null
);

create index if not exists idx_signup_requests_manager on public.signup_requests(manager_id, status);
create unique index if not exists uq_signup_requests_pending_employee
  on public.signup_requests(employee_id) where status = 'PENDING';

alter table public.signup_requests enable row level security;

-- The employee, their manager, and the organization's admins can read a request.
create policy "signup_requests_select" on public.signup_requests for select using (
  public.is_super_admin()
  or employee_id = auth.uid()
  or manager_id = auth.uid()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
-- No insert/update/delete policies: rows are written by the edge function
-- (service role) and decided through decide_signup_request().

-- Bell notification to the manager when a request arrives.
create or replace function public.signup_request_notify_manager()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  emp record;
begin
  select name, email into emp from public.profiles where id = new.employee_id;
  insert into public.notifications
    (organization_id, user_id, type, title, message, priority, reference_id, reference_type, action_url)
  values
    (new.organization_id, new.manager_id, 'SYSTEM', 'New employee sign-up',
     coalesce(emp.name, 'Someone') || coalesce(' (' || emp.email || ')', '') ||
       ' signed up and chose you as their manager. Approve or reject it on your dashboard.',
     'HIGH', new.id::text, 'signup_request', 'dashboard');
  return new;
end;
$$;

drop trigger if exists trg_signup_requests_notify on public.signup_requests;
create trigger trg_signup_requests_notify
  after insert on public.signup_requests
  for each row execute function public.signup_request_notify_manager();

-- Approve or reject. Only the request's manager, or an Admin/HR of the org.
create or replace function public.decide_signup_request(p_request uuid, p_approve boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  select * into r from public.signup_requests where id = p_request for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if not (
    r.manager_id = auth.uid()
    or public.is_super_admin()
    or (r.organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
  ) then
    raise exception 'Only this employee''s manager can decide this request';
  end if;
  if r.status <> 'PENDING' then
    raise exception 'This request was already %', lower(r.status);
  end if;

  update public.signup_requests
     set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
         decided_at = now(),
         decided_by = auth.uid()
   where id = p_request;

  if p_approve then
    update public.profiles set verified = true where id = r.employee_id;
    insert into public.notifications
      (organization_id, user_id, type, title, message, priority, reference_type, action_url)
    values
      (r.organization_id, r.employee_id, 'SYSTEM', 'Welcome aboard',
       'Your manager approved your account. You can now mark attendance and send your Today Task.',
       'NORMAL', 'signup_request', 'dashboard');
    return 'APPROVED';
  end if;
  return 'REJECTED';
end;
$$;

revoke all on function public.decide_signup_request(uuid, boolean) from public;
grant execute on function public.decide_signup_request(uuid, boolean) to authenticated;
