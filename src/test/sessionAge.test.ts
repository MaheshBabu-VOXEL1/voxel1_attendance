import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  MAX_IDLE_MS,
  lastSeenKey,
  readLastSeen,
  markSeen,
  clearLastSeen,
  isAwayTooLong,
} from '../services/session/sessionAge';

/**
 * A user stays logged in while they keep opening the app, and is logged out only
 * after 3 days without opening it. Each open restarts their own clock.
 * sessionManager.ts is a frozen module (Others/CLAUDE.md), so the rule lives in
 * sessionAge.ts and these tests pin both the rule and how it is wired in.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

beforeEach(() => localStorage.clear());

describe('the 3-day rule', () => {
  it('is three days', () => {
    expect(MAX_IDLE_MS).toBe(3 * DAY);
  });

  it('keeps someone who last opened the app just under 3 days ago', () => {
    expect(isAwayTooLong(NOW - (3 * DAY - HOUR), NOW)).toBe(false);
  });

  it('logs out someone who has not opened it for just over 3 days', () => {
    expect(isAwayTooLong(NOW - (3 * DAY + 60_000), NOW)).toBe(true);
  });

  it('never logs out someone who opens the app every day', () => {
    // 9:00 check-in and 19:00 check-out, every day for 10 days.
    const start = NOW - 10 * DAY;
    markSeen('emp1', start);
    for (let d = 0; d < 10; d++) {
      for (const at of [start + d * DAY + 9 * HOUR, start + d * DAY + 19 * HOUR]) {
        expect(isAwayTooLong(readLastSeen('emp1'), at)).toBe(false);
        markSeen('emp1', at);
      }
    }
  });

  it('opening the app restarts the clock', () => {
    markSeen('emp1', NOW - 2 * DAY);
    markSeen('emp1', NOW); // opened today
    expect(isAwayTooLong(readLastSeen('emp1'), NOW + 2 * DAY)).toBe(false);
  });
});

describe('each employee has their own clock', () => {
  it('one user being away does not affect another', () => {
    markSeen('away', NOW - 5 * DAY);
    markSeen('daily', NOW - HOUR);
    expect(isAwayTooLong(readLastSeen('away'), NOW)).toBe(true);
    expect(isAwayTooLong(readLastSeen('daily'), NOW)).toBe(false);
  });

  it('logging out clears only that user', () => {
    markSeen('a', NOW);
    markSeen('b', NOW);
    clearLastSeen('a');
    expect(readLastSeen('a')).toBeNull();
    expect(readLastSeen('b')).toBe(NOW);
  });
});

describe('a missing or broken timestamp never logs anyone out', () => {
  it.each([
    ['nothing stored', null],
    ['garbage', 'not-a-number'],
    ['zero', '0'],
    ['negative', '-5'],
  ])('%s', (_name, raw) => {
    if (raw !== null) localStorage.setItem(lastSeenKey('u'), raw);
    expect(readLastSeen('u')).toBeNull();
    expect(isAwayTooLong(readLastSeen('u'), NOW)).toBe(false);
  });

  it('a time in the future (clock was changed)', () => {
    expect(isAwayTooLong(NOW + DAY, NOW)).toBe(false);
  });
});

describe('sessionManager wiring', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../services/session/sessionManager.ts'), 'utf8');
  const method = (name: string) => {
    const start = src.indexOf(name);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    return src.slice(start, src.indexOf('\n  },', start));
  };
  const attemptRefresh = src.slice(src.indexOf('async function attemptRefresh'), src.indexOf('// --- Public API'));

  it('still has exactly one signOut call', () => {
    expect(src.match(/supabase\.auth\.signOut\(/g)).toHaveLength(1);
  });

  it('logs out through performForceLogout with SESSION_EXPIRED, on this device only', () => {
    expect(src).toMatch(/performForceLogout\('SESSION_EXPIRED'\)/);
    expect(src).toMatch(/signOut\(reason === 'SESSION_EXPIRED' \? \{ scope: 'local' \} : undefined\)/);
  });

  it('opening the app checks the clock first, then restarts it', () => {
    const init = method('async initialize()');
    expect(init.indexOf('checkSessionAge')).toBeGreaterThan(-1);
    expect(init.indexOf('checkSessionAge')).toBeLessThan(init.indexOf('markSeen'));
  });

  it('returning to the app checks before the refresh cooldown, then restarts the clock', () => {
    const visible = method('async onVisible()');
    expect(visible.indexOf('checkSessionAge')).toBeGreaterThan(-1);
    expect(visible.indexOf('checkSessionAge')).toBeLessThan(visible.indexOf('markSeen'));
    expect(visible.indexOf('markSeen')).toBeLessThan(visible.indexOf('VISIBILITY_COOLDOWN_MS'));
  });

  it('logging in starts the clock', () => {
    expect(method('setCurrentUser(')).toMatch(/markSeen\(user\.id\)/);
  });

  it('the background refresh only checks — an app left hidden for 3 days still logs out', () => {
    expect(attemptRefresh).toMatch(/checkSessionAge\(/);
    expect(attemptRefresh).not.toMatch(/markSeen/);
  });

  it('logging out forgets the clock', () => {
    const logout = src.slice(src.indexOf('async function performForceLogout'), src.indexOf('async function checkSessionAge'));
    expect(logout).toMatch(/clearLastSeen\(userId\)/);
  });
});
