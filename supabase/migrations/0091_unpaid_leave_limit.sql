-- Unpaid leave limit, controlled by the leave approver (Maruthi) or Admin.
-- * Usage counts from 0 every calendar year (by the leave's start date). Pending and
--   approved unpaid requests count; rejected and cancelled ones do not.
-- * The limit is one number for everyone (employee_id null) and/or a number per person
--   (that person's row wins). No row at all = no limit, the days are only counted.
-- * A request that would go over the limit is refused; only Maruthi or Admin can raise it.
begin;

create table if not exists public.unpaid_leave_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid references public.profiles(id) on delete cascade,
  limit_days numeric(5,1) not null check (limit_days between 0 and 366),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index if not exists unpaid_leave_limits_one
  on public.unpaid_leave_limits (organization_id, coalesce(employee_id, '00000000-0000-0000-0000-000000000000'::uuid));
-- No policies: the table is read and written only through the functions below.
alter table public.unpaid_leave_limits enable row level security;

create or replace function public.unpaid_days_used(p_org uuid, p_employee text, p_year integer, p_skip uuid default null)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(total_days), 0) from public.leaves
  where organization_id = p_org and employee_id = p_employee and type = 'UNPAID'
    and status in ('PENDING_MANAGER','PENDING_HR','APPROVED')
    and extract(year from start_date) = p_year
    and (p_skip is null or id <> p_skip);
$$;
revoke all on function public.unpaid_days_used(uuid, text, integer, uuid) from public, anon, authenticated;

-- The person's own limit, else everyone's limit, else null (no limit).
create or replace function public.unpaid_limit_for(p_org uuid, p_employee uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select limit_days from public.unpaid_leave_limits where organization_id = p_org and employee_id = p_employee),
    (select limit_days from public.unpaid_leave_limits where organization_id = p_org and employee_id is null));
$$;
revoke all on function public.unpaid_limit_for(uuid, uuid) from public, anon, authenticated;

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
  if auth.uid() is null or public.auth_role() = 'ADMIN' or public.is_leave_approver() then
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
drop trigger if exists leaves_unpaid_limit on public.leaves;
create trigger leaves_unpaid_limit before insert or update on public.leaves
  for each row execute function public.enforce_unpaid_leave_limit();

-- Everything the screens need in one call: the year, everyone's limit, whether the caller
-- may change limits, and per person used / limit. Employees get only their own row.
create or replace function public.unpaid_leave_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare actor public.profiles; yr integer := extract(year from (now() at time zone 'Asia/Kolkata'))::integer;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.status = 'INACTIVE' then
    raise exception 'Sign in again to see unpaid leave' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'year', yr,
    'default_limit', (select limit_days from public.unpaid_leave_limits where organization_id = actor.organization_id and employee_id is null),
    'can_edit', public.is_leave_approver() or actor.role = 'ADMIN',
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'employee_id', p.id, 'name', p.name,
        'used', public.unpaid_days_used(p.organization_id, p.id::text, yr),
        'limit_days', public.unpaid_limit_for(p.organization_id, p.id),
        'own_limit', exists(select 1 from public.unpaid_leave_limits l where l.organization_id = p.organization_id and l.employee_id = p.id))
        order by p.name)
      from public.profiles p
      where p.organization_id = actor.organization_id and p.status <> 'INACTIVE' and p.role in ('EMPLOYEE','MANAGER')
        and (p.id = actor.id or actor.role in ('MANAGER','ADMIN'))), '[]'::jsonb));
end;
$$;
revoke all on function public.unpaid_leave_overview() from public, anon;
grant execute on function public.unpaid_leave_overview() to authenticated;

-- p_employee_id null = everyone's limit; p_limit null = remove (person falls back to everyone's limit).
create or replace function public.set_unpaid_leave_limit(p_employee_id uuid, p_limit numeric)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.profiles; person public.profiles;
begin
  select * into actor from public.profiles where id = auth.uid();
  if actor.id is null or actor.status = 'INACTIVE' or not (public.is_leave_approver() or actor.role = 'ADMIN') then
    raise exception 'Only Maruthi can change unpaid leave limits' using errcode = '42501';
  end if;
  if p_limit is not null and (p_limit < 0 or p_limit > 366 or p_limit * 2 <> floor(p_limit * 2)) then
    raise exception 'Enter a limit from 0 to 366 days (half days allowed)';
  end if;
  if p_employee_id is not null then
    select * into person from public.profiles where id = p_employee_id;
    if person.id is null or person.organization_id is distinct from actor.organization_id then
      raise exception 'Choose a person from your organization' using errcode = '42501';
    end if;
  end if;
  delete from public.unpaid_leave_limits
  where organization_id = actor.organization_id and employee_id is not distinct from p_employee_id;
  if p_limit is not null then
    insert into public.unpaid_leave_limits (organization_id, employee_id, limit_days, updated_by)
    values (actor.organization_id, p_employee_id, p_limit, actor.id);
  end if;
end;
$$;
revoke all on function public.set_unpaid_leave_limit(uuid, numeric) from public, anon;
grant execute on function public.set_unpaid_leave_limit(uuid, numeric) to authenticated;

commit;
notify pgrst, 'reload schema';
