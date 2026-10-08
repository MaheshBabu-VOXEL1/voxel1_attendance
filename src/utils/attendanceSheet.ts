import { Attendance, Employee, Holiday, LeaveRequest } from '../types';

/**
 * The attendance sheet: one row per employee, one column per day.
 *
 *   PRESENT  ✓  checked in that day (still in, or already checked out)
 *   ABSENT   ✗  a past working day with no attendance, or marked absent
 *   LEAVE    L  approved leave
 *   OFF      –  weekend / holiday / before the employee joined
 *   PENDING  –  today, not checked in yet (the day is not over)
 */
export type SheetMark = 'PRESENT' | 'ABSENT' | 'LEAVE' | 'OFF' | 'PENDING';

export interface SheetCell {
  mark: SheetMark;
  /** Short explanation for the tooltip, e.g. "In 09:05 · Out 18:10". */
  detail: string;
}

export interface SheetRow {
  employee: Employee;
  cells: SheetCell[];
  presentCount: number;
  absentCount: number;
}

/** Local calendar date as YYYY-MM-DD. */
export const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The last `count` days ending today, oldest first. */
export const lastDays = (today: Date, count: number): string[] =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - 1 - i));
    return ymd(d);
  });

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const dayName = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number);
  return DAY_NAMES[new Date(y, m - 1, d).getDay()];
};

export function buildAttendanceSheet(args: {
  employees: Employee[];
  logs: Attendance[];
  holidays: Holiday[];
  leaves: LeaveRequest[];
  workingDays: string[];
  dates: string[];
  today: string;
}): SheetRow[] {
  const { employees, logs, holidays, leaves, workingDays, dates, today } = args;

  const holidayByDate = new Map(holidays.map(h => [h.date.split(' ')[0].split('T')[0], h.name]));
  const logByKey = new Map<string, Attendance>();
  for (const log of logs) logByKey.set(`${log.employeeId}|${log.date}`, log);
  const approvedLeaves = leaves.filter(l => l.status === 'APPROVED');
  const onLeave = (employeeId: string, date: string) =>
    approvedLeaves.some(l => l.employeeId === employeeId
      && l.startDate.split(' ')[0].split('T')[0] <= date
      && date <= l.endDate.split(' ')[0].split('T')[0]);

  return employees.map(employee => {
    const started = (employee.joiningDate || employee.created || '').split('T')[0].split(' ')[0];
    let presentCount = 0;
    let absentCount = 0;

    const cells = dates.map((date): SheetCell => {
      const log = logByKey.get(`${employee.id}|${date}`);

      if (log && log.status !== 'ABSENT' && log.status !== 'LEAVE' && log.checkIn && log.checkIn !== '-') {
        presentCount++;
        const late = log.status === 'LATE' ? ' (late)' : '';
        return { mark: 'PRESENT', detail: `In ${log.checkIn}${late}${log.checkOut ? ` · Out ${log.checkOut}` : ' · still checked in'}` };
      }
      if (started && date < started) return { mark: 'OFF', detail: 'Before joining' };
      if (holidayByDate.has(date)) return { mark: 'OFF', detail: `Holiday: ${holidayByDate.get(date)}` };
      if (workingDays.length > 0 && !workingDays.includes(dayName(date))) return { mark: 'OFF', detail: 'Not a working day' };
      if (log && log.status === 'LEAVE') return { mark: 'LEAVE', detail: 'On leave' };
      if (onLeave(employee.id, date)) return { mark: 'LEAVE', detail: 'Approved leave' };
      if (log && log.status === 'ABSENT') {
        absentCount++;
        return { mark: 'ABSENT', detail: 'Marked absent' };
      }
      if (date >= today) return { mark: 'PENDING', detail: 'Not checked in yet today' };
      absentCount++;
      return { mark: 'ABSENT', detail: 'No attendance' };
    });

    return { employee, cells, presentCount, absentCount };
  });
}

const SYMBOL: Record<SheetMark, string> = { PRESENT: '✓', ABSENT: '✗', LEAVE: 'L', OFF: '-', PENDING: '-' };

/** The sheet as CSV (with a BOM so Excel reads ✓ / ✗ correctly). */
export function attendanceSheetCsv(rows: SheetRow[], dates: string[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ['Employee', 'Employee ID', ...dates, 'Present', 'Absent'];
  const lines = rows.map(r => [
    r.employee.name,
    r.employee.employeeId || '',
    ...r.cells.map(c => SYMBOL[c.mark]),
    String(r.presentCount),
    String(r.absentCount),
  ]);
  return '﻿' + [header, ...lines].map(l => l.map(esc).join(',')).join('\r\n');
}
