import { Attendance } from '../types';

/** Sum recorded sessions, excluding gaps and avoiding double-counted overlaps. */
export function officeHours(logs: Attendance[], employeeId: string, date: string): string {
  const minutes = (value?: string): number | null => {
    if (!value || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
    const [h, m] = value.split(':').map(Number);
    return h < 24 && m < 60 ? h * 60 + m : null;
  };
  const intervals: [number, number][] = [];
  let incomplete = false;
  for (const log of logs.filter(row => row.employeeId === employeeId && row.date === date)) {
    const start = minutes(log.checkIn), end = minutes(log.checkOut);
    if (start === null) continue;
    if (end === null || end < start) { incomplete = true; continue; }
    intervals.push([start, end]);
  }
  if (incomplete) return 'Pending checkout';
  if (!intervals.length) return '—';
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0, previousEnd = 0;
  for (const [start, end] of intervals) {
    total += Math.max(0, end - Math.max(start, previousEnd));
    previousEnd = Math.max(previousEnd, end);
  }
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}
