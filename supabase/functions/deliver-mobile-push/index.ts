// Invoke every minute with x-push-secret. Never expose the Firebase service account to clients.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SignJWT, importPKCS8 } from 'npm:jose@5.9.6';

Deno.serve(async (req) => {
  const secret = Deno.env.get('MOBILE_PUSH_CRON_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('Unauthorized', { status: 401 });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const account = JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT') || '{}');
    if (!account.project_id || !account.client_email || !account.private_key) throw new Error('Firebase configuration missing');
    const key = await importPKCS8(account.private_key, 'RS256');
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
      .setProtectedHeader({ alg: 'RS256' }).setIssuer(account.client_email)
      .setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(key);
    const oauth = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    const auth = await oauth.json();
    if (!oauth.ok || !auth.access_token) throw new Error('Firebase authorization failed');
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: jobs, error } = await db.rpc('claim_mobile_push');
    if (error) throw error;
    let sent = 0;
    for (const job of jobs || []) {
      const { data: device } = await db.from('mobile_push_tokens').select('user_id').eq('token', job.token).maybeSingle();
      const { data: note } = await db.from('notifications').select('user_id,title,message').eq('id', job.notification_id).maybeSingle();
      // A shared device may have signed into a different account since this job was queued.
      if (!device || !note || device.user_id !== job.user_id || note.user_id !== job.user_id) {
        await db.from('mobile_push_queue').delete().eq('id', job.id); continue;
      }
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: {
          token: job.token, notification: { title: note.title, body: note.message || '' },
          data: { notification_id: job.notification_id, user_id: job.user_id },
          android: { priority: 'high', ttl: '86400s', notification: { channel_id: 'voxel1_activity', tag: job.notification_id } },
        } }),
      });
      if (response.ok) {
        const { error: removeError } = await db.from('mobile_push_queue').delete().eq('id', job.id);
        if (removeError) throw removeError;
        sent++;
      } else {
        const result = await response.json();
        if (result.error?.details?.some((d: { errorCode?: string }) => d.errorCode === 'UNREGISTERED')) {
          await db.from('mobile_push_tokens').delete().eq('token', job.token);
        }
        // Other failures retain the job for retry. Exhausted jobs remain for inspection.
      }
    }
    return Response.json({ sent, claimed: jobs?.length || 0 });
  } catch (error) {
    console.error('Mobile push delivery failed', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({ error: 'Mobile push delivery failed' }, { status: 500 });
  }
});
