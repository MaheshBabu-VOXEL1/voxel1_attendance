-- A short, unique code lets employees choose the intended organization even
-- when several organizations have the same display name.
alter table public.organizations add column if not exists join_code text;

update public.organizations
   set join_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
 where join_code is null;

alter table public.organizations
  alter column join_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  alter column join_code set not null;

create unique index if not exists organizations_join_code_key on public.organizations(join_code);
