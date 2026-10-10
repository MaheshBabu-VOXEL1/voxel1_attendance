import { describe, expect, it } from 'vitest';
import { halfDayLabel, halfDayLate, workedMs } from '../halfDay';

const now = Date.parse('2026-10-10T12:00:00Z');
const ago = (min: number) => new Date(now - min * 60000).toISOString();
const base = { half_day: true, started_at: ago(600) };

describe('half-day work clock', () => {
  it('waits for Start before the clock runs', () => {
    expect(halfDayLabel({ ...base, started_at: null, status: 'NOT_STARTED', worked_seconds: 0, work_resumed_at: null }, now)!.text).toBe('Half day · 4h 30m from Start');
  });
  it('counts only running time: a pause keeps the time left', () => {
    // worked 3 h, then paused for hours (another task came first)
    const paused = { ...base, status: 'NOT_STARTED' as const, worked_seconds: 3 * 3600, work_resumed_at: null };
    expect(halfDayLate(paused, now)).toBe(false);
    expect(halfDayLabel(paused, now)!.text).toBe('Half day · paused · 1h 30m left');
    // started again 1 h ago: 4 h worked, 30 min left
    const back = { ...paused, status: 'START' as const, work_resumed_at: ago(60) };
    expect(workedMs(back, now)).toBe(4 * 3600e3);
    expect(halfDayLabel(back, now)).toMatchObject({ late: false });
    expect(halfDayLabel(back, now)!.text).toMatch(/^Half day · finish by /);
  });
  it('is overdue once 4 h 30 min of work is used up', () => {
    const late = { ...base, status: 'PROGRESS' as const, worked_seconds: 4 * 3600, work_resumed_at: ago(45) };
    expect(halfDayLate(late, now)).toBe(true);
    expect(halfDayLabel(late, now)!.text).toMatch(/^Half day · overdue since /);
    expect(halfDayLabel({ ...late, status: 'STUCK', worked_seconds: 5 * 3600, work_resumed_at: null }, now)!.text).toBe('Half day · overdue by 30m');
    expect(halfDayLabel({ ...late, status: 'END' }, now)).toBeNull();
  });
});
