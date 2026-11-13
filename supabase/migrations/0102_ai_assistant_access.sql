-- AI assistant (chatbot) on the Manager screen. While testing, only Kesari (7700901979) may use it.
-- To open it to every manager later, set app_config.aiAssistantScope = 'managers' (no app update):
--   update public.settings set value = jsonb_set(value::jsonb, '{aiAssistantScope}', '"managers"')::text
--   where key = 'app_config' and organization_id = '<voxel1 org id>';
begin;
create or replace function public.can_use_ai_assistant()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.status <> 'INACTIVE' and (
      public.norm_mobile(p.mobile) = '7700901979'
      or (coalesce(public.org_app_config(p.organization_id) ->> 'aiAssistantScope', '') = 'managers'
          and (p.role in ('MANAGER','ADMIN') or public.is_mode_switcher(p))))
    from public.profiles p where p.id = auth.uid()), false);
$$;
revoke all on function public.can_use_ai_assistant() from public, anon;
grant execute on function public.can_use_ai_assistant() to authenticated;
commit;
notify pgrst, 'reload schema';
