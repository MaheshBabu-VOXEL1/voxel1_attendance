/**
 * Session age — how long since this user last opened the app on this device.
 *
 * A user stays logged in for as long as they keep coming back. They are logged
 * out only after MAX_IDLE_MS (3 days) without opening the app. Every open
 * restarts their clock, and each user has their own clock (per-user key), so a
 * colleague on a shared phone never inherits it. sessionManager.ts owns the
 * logout itself; this file only stores and compares timestamps.
 *
 * Anything unreadable — no stored time, garbage, a time in the future after a
 * clock change, storage blocked — counts as "not away too long". Losing the
 * timestamp must never be the reason someone is logged out.
 */

export const MAX_IDLE_MS = 3 * 24 * 60 * 60 * 1000;

export const lastSeenKey = (userId: string) => `voxel1_last_seen_${userId}`;

export function readLastSeen(userId: string): number | null {
  try {
    const n = Number(localStorage.getItem(lastSeenKey(userId)));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function markSeen(userId: string, now = Date.now()): void {
  try { localStorage.setItem(lastSeenKey(userId), String(now)); } catch { /* storage blocked */ }
}

export function clearLastSeen(userId: string): void {
  try { localStorage.removeItem(lastSeenKey(userId)); } catch { /* storage blocked */ }
}

export function isAwayTooLong(lastSeen: number | null, now = Date.now()): boolean {
  if (lastSeen === null || lastSeen > now) return false;
  return now - lastSeen > MAX_IDLE_MS;
}
