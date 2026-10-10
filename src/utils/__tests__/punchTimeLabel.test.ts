import { describe, expect, it } from 'vitest';
import { punchTimeLabel } from '../attendanceUtils';

describe('punchTimeLabel', () => {
  it('turns a raw database timestamp into a readable local time', () => {
    const iso = '2026-10-10T04:43:00+00:00';
    const d = new Date(iso);
    const expected = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    expect(punchTimeLabel(iso)).toBe(expected);
    expect(punchTimeLabel(iso)).not.toContain('T04');
  });
  it('formats HH:mm as 12-hour time', () => {
    expect(punchTimeLabel('09:05')).toBe('9:05 am');
    expect(punchTimeLabel('16:30')).toBe('4:30 pm');
  });
  it('leaves empty values empty', () => { expect(punchTimeLabel('')).toBe(''); expect(punchTimeLabel(undefined)).toBe(''); });
});
