import { describe, expect, it, vi } from 'vitest';
import { subscribePushTarget, openPushTarget, targetFromNotification } from '../pushTarget';

describe('targetFromNotification', () => {
  it('opens the task for task notifications (manager feed and assignee)', () => {
    expect(targetFromNotification({ type: 'TASK', reference_type: 'task', reference_id: 't1' })).toEqual({ kind: 'task', taskId: 't1' });
  });
  it('opens the due-today list for the daily digest', () => {
    expect(targetFromNotification({ type: 'TASK', reference_type: 'task_due', reference_id: 'e1' })).toEqual({ kind: 'task_due', employeeId: 'e1' });
  });
  it('opens leave, attendance and announcements', () => {
    expect(targetFromNotification({ type: 'LEAVE', reference_type: 'leave_request', reference_id: 'l1' })).toEqual({ kind: 'leave', leaveId: 'l1' });
    expect(targetFromNotification({ type: 'ATTENDANCE', reference_type: 'attendance', reference_id: 'a1' })).toEqual({ kind: 'attendance' });
    expect(targetFromNotification({ type: 'ANNOUNCEMENT', reference_type: 'announcement', reference_id: 'c1', metadata: { date: '2026-11-16' } }))
      .toEqual({ kind: 'announcement', date: '2026-11-16' });
  });
  it('falls back to home for unknown or missing rows', () => {
    expect(targetFromNotification(null)).toEqual({ kind: 'home' });
    expect(targetFromNotification({ type: 'SYSTEM' })).toEqual({ kind: 'home' });
  });
});

describe('subscribePushTarget', () => {
  it('delivers a tap that arrived before the screen mounted, once', () => {
    openPushTarget({ kind: 'leave' });
    const a = vi.fn(); const stopA = subscribePushTarget(a); stopA();
    const b = vi.fn(); const stopB = subscribePushTarget(b); stopB();
    expect(a).toHaveBeenCalledWith({ kind: 'leave' });
    expect(b).not.toHaveBeenCalled();
  });
  it('delivers later taps to the mounted screen', () => {
    const h = vi.fn(); const stop = subscribePushTarget(h);
    openPushTarget({ kind: 'task', taskId: 'x' });
    stop();
    expect(h).toHaveBeenCalledWith({ kind: 'task', taskId: 'x' });
  });
});
