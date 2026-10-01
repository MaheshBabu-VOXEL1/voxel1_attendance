// Runs once on startup (to catch downtime), then hourly while Docker is up.
// The edge function deletes files first and clears attendance references only
// after Storage confirms deletion.
const url = process.env.SELFIE_CLEANUP_URL;
const secret = process.env.CRON_SECRET;
if (!url || !secret) {
  throw new Error('SELFIE_CLEANUP_URL and CRON_SECRET are required');
}

let running = false;
async function run() {
  if (running) return;
  running = true;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(4 * 60 * 1000),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(`HTTP ${response.status}: ${JSON.stringify(result)}`);
    console.log(`[selfie-cleanup] ${new Date().toISOString()} retention=${result.retentionDays}d files=${result.storageFilesDeleted} records=${result.recordsCleaned}`);
  } catch (error) {
    console.error('[selfie-cleanup] Failed; retrying on the next hourly run:', error);
  } finally {
    running = false;
  }
}

// Attendance is retained indefinitely; only legacy selfie files are cleaned.
void run();
setInterval(() => { void run(); }, 60 * 60 * 1000);
