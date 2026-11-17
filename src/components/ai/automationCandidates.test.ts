import { describe, expect, it } from 'vitest';
import { findAutomationCandidates, taskKey } from '../../../supabase/functions/ai-assistant/automation';

const who = (t: { employee_name?: string | null }) => t.employee_name || 'Unknown';
const task = (description: string, employee_name: string, created: string, extra: Record<string, string> = {}) =>
  ({ description, employee_name, created, ...extra });

describe('automation candidates', () => {
  it('groups near-identical tasks that differ only by date or number', () => {
    expect(taskKey('Send daily report 14/11 to Ravi!')).toBe(taskKey('send Daily Report 15 Nov to ravi'));
  });

  it('finds a task that repeats across weeks, with people and average hours', () => {
    const rows = [
      task('Update site progress sheet 3 Nov', 'Abhinay', '2026-11-03T05:00:00Z', { started_at: '2026-11-03T05:00:00Z', completed_at: '2026-11-03T07:00:00Z' }),
      task('Update site progress sheet 10 Nov', 'Abhinay', '2026-11-10T05:00:00Z', { started_at: '2026-11-10T05:00:00Z', completed_at: '2026-11-10T09:00:00Z' }),
      task('Update site progress sheet 17 Nov', 'Dharani', '2026-11-17T05:00:00Z'),
      task('Model level 3 slab in Revit', 'Ravi', '2026-11-05T05:00:00Z'),
    ];
    const [c, ...rest] = findAutomationCandidates(rows, who);
    expect(rest).toHaveLength(0);
    expect(c).toMatchObject({ times_given: 3, weeks_seen: 3, people: ['Abhinay', 'Dharani'], avg_hours_to_finish: 3, why: 'repeats' });
    expect(c.routine_words).toEqual(expect.arrayContaining(['update', 'sheet']));
  });

  it('flags routine work seen twice, ignores one-off design work', () => {
    const rows = [
      task('Export BOQ to excel', 'Ravi', '2026-11-02T05:00:00Z'),
      task('Export BOQ to Excel', 'Ravi', '2026-11-12T05:00:00Z'),
      task('Coordinate MEP clash with architect', 'Ravi', '2026-11-04T05:00:00Z'),
      task('Coordinate MEP clash with architect', 'Ravi', '2026-11-06T05:00:00Z'),
    ];
    const out = findAutomationCandidates(rows, who);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ why: 'routine_work', times_given: 2 });
  });

  it('returns nothing for an empty list', () => {
    expect(findAutomationCandidates([], who)).toEqual([]);
  });
});
