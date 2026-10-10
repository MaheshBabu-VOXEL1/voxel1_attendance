import type { AssignedTask } from '../services/assignedTask.service';

/** A half-day task must be finished within 4 h 30 min of the employee's first Start. */
export const HALF_DAY_MS = (4 * 60 + 30) * 60 * 1000;

/** Finish-by time for a started half-day task, or null (not half day / not started yet). */
export const halfDayDeadline = (t: Pick<AssignedTask, 'half_day' | 'started_at'>): Date | null =>
  t.half_day && t.started_at ? new Date(new Date(t.started_at).getTime() + HALF_DAY_MS) : null;

/** true when an open half-day task has run past its 4 h 30 min. */
export const halfDayLate = (t: Pick<AssignedTask, 'half_day' | 'started_at' | 'status'>, now = Date.now()) => {
  const d = halfDayDeadline(t);
  return !!d && t.status !== 'END' && now > d.getTime();
};

export const clock = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
