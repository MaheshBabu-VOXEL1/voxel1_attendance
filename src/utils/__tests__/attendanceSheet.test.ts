import { describe, it, expect } from 'vitest';
import { buildAttendanceSheet, attendanceSheetCsv, lastDays } from '../attendanceSheet';
import type { Attendance, Employee, Holiday, LeaveRequest } from '../../types';

const emp = (over: Partial<Employee> = {}) => ({
  id: 'e1', name: 'Asha', employeeId: 'E-1', role: 'EMPLOYEE', status: 'ACTIVE', joiningDate: '2026-01-01',
  ...over,
}) as Employee;

const log = (date: string, over: Partial<Attendance> = {}) => ({
  id: date, employeeId: 'e1', date, checkIn: '09:05', status: 'PRESENT', ...over,
}) as Attendance;

// Mon 21 Sep – Sat 26 Sep 2026; today is Saturday 26th.
const dates = ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'];
const MON_TO_SAT = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const sheet = (logs: Attendance[], extra: { holidays?: Holiday[]; leaves?: LeaveRequest[]; employee?: Employee } = {}) =>
  buildAttendanceSheet({
    employees: [extra.employee ?? emp()],
    logs,
    holidays: extra.holidays ?? [],
    leaves: extra.leaves ?? [],
    workingDays: MON_TO_SAT,
    dates,
    today: '2026-09-26',
  })[0];

describe('attendance sheet', () => {
  it('ticks days with a check-in, checked out or not, and crosses past working days without one', () => {
    const row = sheet([log('2026-09-21', { checkOut: '18:10' }), log('2026-09-22')]);
    const marks = row.cells.map(c => c.mark);
    expect(marks).toEqual(['OFF', 'PRESENT', 'PRESENT', 'ABSENT', 'ABSENT', 'ABSENT', 'PENDING']);
    expect(row.presentCount).toBe(2);
    expect(row.absentCount).toBe(3);
  });

  it('shows today as a tick once checked in', () => {
    expect(sheet([log('2026-09-26')]).cells[6].mark).toBe('PRESENT');
  });

  it('counts a late arrival as present', () => {
    expect(sheet([log('2026-09-23', { status: 'LATE' })]).cells[3].mark).toBe('PRESENT');
  });

  it('crosses a day marked absent', () => {
    expect(sheet([log('2026-09-23', { status: 'ABSENT', checkIn: '-' })]).cells[3].mark).toBe('ABSENT');
  });

  it('does not cross holidays, approved leave or days before joining', () => {
    const row = sheet([], {
      holidays: [{ id: 'h', date: '2026-09-23', name: 'Festival', isGovernment: true, type: 'FESTIVAL' }],
      leaves: [{ employeeId: 'e1', startDate: '2026-09-24', endDate: '2026-09-25', status: 'APPROVED' } as LeaveRequest],
      employee: emp({ joiningDate: '2026-09-22' }),
    });
    expect(row.cells.map(c => c.mark)).toEqual(['OFF', 'OFF', 'ABSENT', 'OFF', 'LEAVE', 'LEAVE', 'PENDING']);
  });

  it('falls back to the account creation date when no joining date is set', () => {
    const row = sheet([], { employee: emp({ joiningDate: '', created: '2026-09-26T05:00:00Z' }) });
    expect(row.cells.every(c => c.mark === 'OFF' || c.mark === 'PENDING')).toBe(true);
  });
});

describe('lastDays', () => {
  it('returns the last N days ending today, oldest first', () => {
    expect(lastDays(new Date(2026, 8, 26), 3)).toEqual(['2026-09-24', '2026-09-25', '2026-09-26']);
  });
});

describe('attendanceSheetCsv', () => {
  it('writes ticks and crosses with totals, readable by Excel', () => {
    const row = sheet([log('2026-09-21')]);
    const csv = attendanceSheetCsv([row], dates);
    expect(csv.startsWith('﻿')).toBe(true);
    const [header, line] = csv.slice(1).split('\r\n');
    expect(header).toBe('Employee,Employee ID,2026-09-20,2026-09-21,2026-09-22,2026-09-23,2026-09-24,2026-09-25,2026-09-26,Present,Absent');
    expect(line).toBe('Asha,E-1,-,✓,✗,✗,✗,✗,-,1,4');
  });
});
