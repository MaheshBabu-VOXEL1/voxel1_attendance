-- ============================================================
-- Voxel1 — Daily "Today Task" submissions
-- 0038_daily_tasks.sql
--
-- Employees submit what they're working on today (one entry per
-- employee per day). They can edit it for 1 hour after first
-- submitting (measured from `created`); after that it is locked.
-- Their line manager sees it on the "Team Tasks" page; HR/Admin see
-- the whole org.
--
-- employee_name / line_manager_id / organization_id are copied from
-- the employee's profile by a trigger, so a client can't route a
-- task to a different manager or organization.
-- ============================================================

create table if not exists public.daily_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id     uuid not null references public.profiles(id) on delete cascade,
  employee_name   text,
  line_manager_id uuid references public.profiles(id) on delete set null,
  task_date       date not null,
  tasks           text not null check (length(trim(tasks)) > 0),
  created         timestamptz not null default now(),
  updated         timestamptz not null default now(),
  unique (employee_id, task_date)
);

create index if not exists idx_daily_tasks_org_date on public.daily_tasks(organization_id, task_date);
create index if not exists idx_daily_tasks_manager_date on public.daily_tasks(line_manager_id, task_date);

-- Fill routing fields from the employee's profile (ignores client-sent values)
create or replace function public.daily_tasks_fill_from_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p record;
begin
  select name, line_manager_id, organization_id into p
  from public.profiles where id = new.employee_id;

  if not found then
    raise exception 'Employee profile not found';
  end if;

  new.employee_name   := p.name;
  new.line_manager_id := p.line_manager_id;
  new.organization_id := p.organization_id;
  -- The 1-hour edit window is measured from the first submission; never let an update move it.
  if tg_op = 'UPDATE' then
    new.created := old.created;
  else
    new.created := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_daily_tasks_fill on public.daily_tasks;
create trigger trg_daily_tasks_fill
  before insert or update on public.daily_tasks
  for each row execute function public.daily_tasks_fill_from_profile();

drop trigger if exists trg_daily_tasks_updated_at on public.daily_tasks;
create trigger trg_daily_tasks_updated_at
  before update on public.daily_tasks
  for each row execute function public.set_updated_at();

-- ---- Row-level security ----
alter table public.daily_tasks enable row level security;

-- Own tasks; the employee's line manager; HR/Admin in the same org
create policy "daily_tasks_select" on public.daily_tasks for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      employee_id = auth.uid()
      or line_manager_id = auth.uid()
      or public.auth_role() in ('ADMIN','HR')
    )
  )
);

-- Employees write only their own row
create policy "daily_tasks_insert" on public.daily_tasks for insert with check (
  employee_id = auth.uid()
);
-- Edits allowed only within 1 hour of the first submission
create policy "daily_tasks_update" on public.daily_tasks for update using (
  employee_id = auth.uid()
  and created > now() - interval '1 hour'
) with check (
  employee_id = auth.uid()
);

create policy "daily_tasks_delete" on public.daily_tasks for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
