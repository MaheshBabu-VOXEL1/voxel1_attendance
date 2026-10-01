import { describe, it, expect } from 'vitest';
import { buildTaskSheet, taskSheetCsv } from '../taskSheet';

const task = (employeeId: string, employeeName: string, taskDate: string, tasks: string) => ({
  id: `${employeeId}-${taskDate}`, employeeId, employeeName, taskDate, tasks,
  firstSubmittedAt: `${taskDate}T04:00:00Z`, submittedAt: `${taskDate}T04:00:00Z`,
});
const dates = ['2026-09-24', '2026-09-25', '2026-09-26'];

describe('buildTaskSheet', () => {
  it('puts each task under its employee and date, blank when nothing was sent', () => {
    const rows = buildTaskSheet(
      [{ id: 'e2', name: 'Ravi' }, { id: 'e1', name: 'Asha' }],
      [task('e1', 'Asha', '2026-09-24', 'A1'), task('e1', 'Asha', '2026-09-26', 'A3')],
      dates,
    );
    expect(rows.map(r => r.person.name)).toEqual(['Asha', 'Ravi']);
    expect(rows[0].cells.map(c => c?.tasks ?? null)).toEqual(['A1', null, 'A3']);
    expect(rows[0].sentCount).toBe(2);
    expect(rows[1].cells.every(c => c === null)).toBe(true);
  });

  it('still lists someone who sent a task but is not in the team list', () => {
    const rows = buildTaskSheet([], [task('e9', 'Moved', '2026-09-25', 'x')], dates);
    expect(rows.map(r => r.person.name)).toEqual(['Moved']);
  });
});

describe('taskSheetCsv', () => {
  it('writes the full task text, quoting line breaks and commas for Excel', () => {
    const rows = buildTaskSheet([{ id: 'e1', name: 'Asha' }], [task('e1', 'Asha', '2026-09-25', 'Fix bug, test\nDeploy')], dates);
    const csv = taskSheetCsv(rows, dates);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Employee,2026-09-24,2026-09-25,2026-09-26,Days sent');
    expect(csv).toContain('Asha,,"Fix bug, test\nDeploy",,1');
  });
});
