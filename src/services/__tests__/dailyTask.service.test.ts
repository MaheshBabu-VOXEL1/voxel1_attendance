import { describe, it, expect } from 'vitest';
import { isTaskLocked, editDeadline, TASK_EDIT_WINDOW_MS, DailyTask } from '../dailyTask.service';

const task = (firstSubmittedAt: string): DailyTask => ({
  id: 't1', employeeId: 'e1', employeeName: 'Mahesh', taskDate: '2026-09-25',
  tasks: 'Work', firstSubmittedAt, submittedAt: firstSubmittedAt,
});

describe('Today Task edit window', () => {
  const first = '2026-09-25T10:00:00Z';
  const at = (iso: string) => new Date(iso).getTime();

  it('is one hour long', () => {
    expect(TASK_EDIT_WINDOW_MS).toBe(60 * 60 * 1000);
    expect(editDeadline(task(first)).toISOString()).toBe('2026-09-25T11:00:00.000Z');
  });

  it('allows edits within the hour after first submitting', () => {
    expect(isTaskLocked(task(first), at('2026-09-25T10:00:00Z'))).toBe(false);
    expect(isTaskLocked(task(first), at('2026-09-25T10:59:59Z'))).toBe(false);
  });

  it('locks at exactly one hour and stays locked', () => {
    expect(isTaskLocked(task(first), at('2026-09-25T11:00:00Z'))).toBe(true);
    expect(isTaskLocked(task(first), at('2026-09-25T15:00:00Z'))).toBe(true);
  });

  it('measures from the first submission, not the latest edit', () => {
    const edited = { ...task(first), submittedAt: '2026-09-25T10:50:00Z' };
    expect(isTaskLocked(edited, at('2026-09-25T11:05:00Z'))).toBe(true);
  });
});
