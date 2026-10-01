import { describe, expect, it } from 'vitest';
import { officeHours } from '../officeHours';
import { Attendance } from '../../types';
const row = (checkIn: string, checkOut?: string) => ({ employeeId: 'e', date: '2026-10-01', checkIn, checkOut } as Attendance);
describe('office hours', () => {
  it('shows hours and minutes for the recorded session', () => {
    expect(officeHours([row('12:44', '15:53')], 'e', '2026-10-01')).toBe('3h 9m');
  });
  it('excludes gaps and does not double count overlapping sessions', () => {
    expect(officeHours([row('09:00', '12:00'), row('11:00', '12:00'), row('13:00', '17:00')], 'e', '2026-10-01')).toBe('7h 0m');
  });
  it('does not claim a final total without checkout', () => {
    expect(officeHours([row('09:00')], 'e', '2026-10-01')).toBe('Pending checkout');
    expect(officeHours([row('-', '-')], 'e', '2026-10-01')).toBe('—');
  });
});
