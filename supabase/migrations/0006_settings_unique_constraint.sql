-- Required for settings upsert onConflict: 'organization_id,key'
-- Allows null organization_id (platform-level settings like guide_help_links)
create unique index if not exists idx_settings_org_key
  on public.settings (organization_id, key)
  where organization_id is not null;

create unique index if not exists idx_settings_platform_key
  on public.settings (key)
  where organization_id is null;
