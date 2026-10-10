import type { AssignedTask } from '../services/assignedTask.service';

/** A half-day task gets 4 h 30 min of working time. Pause / Stuck stop the clock; Start continues it. */
export const HALF_DAY_MS = (4 * 60 + 30) * 60 * 1000;

type ClockTask = Pick<AssignedTask, 'half_day' | 'status' | 'started_at' | 'worked_seconds' | 'work_resumed_at'>;
const running = (t: ClockTask) => t.status === 'START' || t.status === 'PROGRESS';

/** Working time spent on the task so far, in ms (running stretch included). */
export const workedMs = (t: ClockTask, now = Date.now()) => {
  // Before migration 0084 the clock columns are missing: fall back to the first Start.
  const resumed = t.work_resumed_at ?? (t.worked_seconds === undefined ? t.started_at : null);
  return (t.worked_seconds || 0) * 1000 + (running(t) && resumed ? Math.max(0, now - Date.parse(resumed)) : 0);
};

/** true when an open half-day task has used up its 4 h 30 min. */
export const halfDayLate = (t: ClockTask, now = Date.now()) => !!t.half_day && t.status !== 'END' && workedMs(t, now) > HALF_DAY_MS;

export const clock = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
const dur = (ms: number) => { const m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };

/** Line shown on an open half-day task, or null. */
export const halfDayLabel = (t: ClockTask, now = Date.now()): { text: string; late: boolean } | null => {
  if (!t.half_day || t.status === 'END') return null;
  const worked = workedMs(t, now), left = HALF_DAY_MS - worked, on = running(t);
  if (!on && !worked && !t.started_at) return { text: 'Half day · 4h 30m from Start', late: false };
  if (left < 0) return { text: on ? `Half day · overdue since ${clock(new Date(now + left))}` : `Half day · overdue by ${dur(-left)}`, late: true };
  return { text: on ? `Half day · finish by ${clock(new Date(now + left))}` : `Half day · paused · ${dur(left)} left`, late: false };
};
