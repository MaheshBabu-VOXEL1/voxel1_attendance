-- Run AFTER deploying deliver-mobile-push and applying migration 0100.
-- Store mobile_push_url and mobile_push_cron_secret in Supabase Vault first.
-- URL: https://YOUR_PROJECT.supabase.co/functions/v1/deliver-mobile-push
-- Secret must match the Edge Function MOBILE_PUSH_CRON_SECRET.
select cron.schedule('deliver-mobile-push', '* * * * *', $$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name = 'mobile_push_url'),
   headers := jsonb_build_object('Content-Type','application/json','x-push-secret',
     (select decrypted_secret from vault.decrypted_secrets where name = 'mobile_push_cron_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 55000
 );
$$);
