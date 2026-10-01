// Voxel1 — Selfie Purge Cron
// Schedule: hourly (unchanged from the old retention job).
//
// Attendance no longer takes a selfie: check-in and check-out use GPS location
// only. This job deletes every selfie photo still stored, then clears the photo
// links on attendance records. It empties the whole `selfies` bucket, so photos
// that were uploaded but never linked to a record go too.
//
// Database links are cleared only after every file is confirmed deleted; any
// failure leaves them in place and the next hourly run retries. Once the bucket
// is empty each run is a single list call, and the job (and its schedule) can
// be removed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SELFIE_BUCKET = 'selfies';
const LIST_PAGE = 1000;
const MAX_DELETE_BATCH = 500; // Supabase Storage remove() limit per call

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  // ── Auth guard ────────────────────────────────────────────────────────────
  const cronSecret = Deno.env.get('CRON_SECRET');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization') || '';

  // Three valid ways to authenticate:
  // 1. pg_net internal call: Authorization: Bearer <CRON_SECRET> (bypasses Kong)
  // 2. External call with service_role key: Authorization: Bearer <service_role_key>
  // 3. External call with x-cron-secret header (when passing anon key to Kong)
  const cronHeader = req.headers.get('x-cron-secret');
  const isCronSecret = cronSecret && (authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret);
  const isServiceRole = serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`;

  if (!isCronSecret && !isServiceRole) {
    return jsonResponse(401, { success: false, message: 'Unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);
  const bucket = admin.storage.from(SELFIE_BUCKET);

  console.log('[cron-selfie-storage-cleanup] Purging all selfies...');

  try {
    // ── Collect every file in the bucket ──────────────────────────────────
    // Files live one folder deep (<recordId>/selfie.webp). Walk folders
    // recursively so any other layout is caught too.
    const files: string[] = [];
    const walk = async (prefix: string) => {
      for (let offset = 0; ; offset += LIST_PAGE) {
        const { data, error } = await bucket.list(prefix, { limit: LIST_PAGE, offset });
        if (error) throw new Error(`list "${prefix}": ${error.message}`);
        if (!data || data.length === 0) return;
        for (const item of data) {
          const path = prefix ? `${prefix}/${item.name}` : item.name;
          // Folders have no id; files do.
          if (item.id) files.push(path);
          else await walk(path);
        }
        if (data.length < LIST_PAGE) return;
      }
    };
    await walk('');

    // ── Delete them ───────────────────────────────────────────────────────
    let storageFilesDeleted = 0;
    let errors = 0;
    for (let i = 0; i < files.length; i += MAX_DELETE_BATCH) {
      const chunk = files.slice(i, i + MAX_DELETE_BATCH);
      const { data: removed, error } = await bucket.remove(chunk);
      if (error) {
        console.error(`[cron-selfie-storage-cleanup] Storage delete error (chunk ${i}):`, error.message);
        errors += chunk.length;
      } else {
        storageFilesDeleted += removed?.length ?? 0;
        errors += chunk.length - (removed?.length ?? 0);
      }
    }

    // ── Clear the photo links, only when no file is left behind ───────────
    let recordsCleaned = 0;
    if (errors === 0) {
      const { data: cleared, error: updateError } = await admin
        .from('attendance')
        .update({ selfie: null })
        .not('selfie', 'is', null)
        .select('id');
      if (updateError) {
        console.error('[cron-selfie-storage-cleanup] DB update error:', updateError.message);
        errors++;
      } else {
        recordsCleaned = cleared?.length ?? 0;
      }
    }

    console.log(`[cron-selfie-storage-cleanup] Done. files_found=${files.length} storage_deleted=${storageFilesDeleted} records_cleared=${recordsCleaned} errors=${errors}`);
    return jsonResponse(errors > 0 ? 500 : 200, {
      success: errors === 0,
      filesFound: files.length,
      storageFilesDeleted,
      recordsCleaned,
      errors,
    });

  } catch (err: any) {
    console.error('[cron-selfie-storage-cleanup] Fatal error:', err?.message || err);
    return jsonResponse(500, { success: false, message: err?.message || 'Internal error' });
  }
});
