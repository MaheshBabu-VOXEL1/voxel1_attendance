import type { DailyTask } from '../services/dailyTask.service';

/**
 * The Team Tasks sheet: one row per employee, one column per day, the task the
 * employee sent that day in the cell (null when nothing was sent).
 */
export interface TaskSheetPerson {
  id: string;
  name: string;
}

export interface TaskSheetRow {
  person: TaskSheetPerson;
  cells: (DailyTask | null)[];
  sentCount: number;
}

export function buildTaskSheet(people: TaskSheetPerson[], tasks: DailyTask[], dates: string[]): TaskSheetRow[] {
  const byKey = new Map(tasks.map(t => [`${t.employeeId}|${t.taskDate}`, t]));

  // Anyone who sent a task shows up even if they are not in the given list
  // (e.g. moved to another manager since).
  const all = new Map(people.map(p => [p.id, p]));
  for (const t of tasks) {
    if (!all.has(t.employeeId)) all.set(t.employeeId, { id: t.employeeId, name: t.employeeName });
  }

  return [...all.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(person => {
      const cells = dates.map(d => byKey.get(`${person.id}|${d}`) ?? null);
      return { person, cells, sentCount: cells.filter(Boolean).length };
    });
}

/** The sheet as CSV for Excel: full task text in each cell (BOM so Excel reads it as UTF-8). */
export function taskSheetCsv(rows: TaskSheetRow[], dates: string[]): string {
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ['Employee', ...dates, 'Days sent'];
  const lines = rows.map(r => [
    r.person.name,
    ...r.cells.map(c => (c ? c.tasks.trim() : '')),
    String(r.sentCount),
  ]);
  return '﻿' + [header, ...lines].map(l => l.map(esc).join(',')).join('\r\n');
}
