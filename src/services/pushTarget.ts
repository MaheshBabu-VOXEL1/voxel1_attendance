/**
 * Where a tapped phone notification should open.
 * nativePush.service.ts resolves the notification row into a PushTarget; the screen that is
 * showing (ManagerApp, EmployeeDay, or App for other roles) opens it. A tap that arrives
 * before that screen has mounted (cold start) waits here until the screen takes it.
 */
export type PushTarget =
  | { kind: 'task'; taskId: string }
  | { kind: 'task_due'; employeeId?: string }
  | { kind: 'leave'; leaveId?: string }
  | { kind: 'attendance' }
  | { kind: 'announcement'; date?: string }
  | { kind: 'home' };

export interface NotificationRow {
  type?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
  metadata?: Record<string, unknown> | null;
}

const EVENT = 'voxel1:push-target';
let pending: PushTarget | null = null;

export function targetFromNotification(row: NotificationRow | null | undefined): PushTarget {
  if (!row) return { kind: 'home' };
  const ref = (row.reference_type || '').toLowerCase();
  const type = (row.type || '').toUpperCase();
  const id = row.reference_id || undefined;
  const meta = row.metadata || {};
  if (ref === 'task_due') return { kind: 'task_due', employeeId: id || (meta.employee_id as string | undefined) };
  if ((ref === 'task' || type === 'TASK') && id) return { kind: 'task', taskId: id };
  if (ref === 'announcement' || type === 'ANNOUNCEMENT') return { kind: 'announcement', date: meta.date as string | undefined };
  if (type === 'LEAVE' || ref.startsWith('leave')) return { kind: 'leave', leaveId: id };
  if (ref === 'attendance' || type === 'ATTENDANCE') return { kind: 'attendance' };
  return { kind: 'home' };
}

/** Hand a target to whichever screen is showing (or keep it for the next one to mount). */
export function openPushTarget(target: PushTarget): void {
  pending = target;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Take the waiting target, if any (each target is opened once). */
export function takePushTarget(): PushTarget | null {
  const t = pending;
  pending = null;
  return t;
}

/** Calls `handle` with every target, including one that arrived before this screen mounted. */
export function subscribePushTarget(handle: (t: PushTarget) => void): () => void {
  const run = () => { const t = takePushTarget(); if (t) handle(t); };
  window.addEventListener(EVENT, run);
  run();
  return () => window.removeEventListener(EVENT, run);
}
