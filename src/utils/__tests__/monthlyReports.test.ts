import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import writeXlsxFile from 'write-excel-file/browser';
import { indiaDate, isMonthEnd, monthWindow, taskInMonth, taskSheet } from '../monthlyReports';
import type { AssignedTask } from '../../services/assignedTask.service';

describe('monthly reporting', () => {
  it('uses India month boundaries, including leap years and December', () => {
    expect(indiaDate(new Date('2026-10-31T18:30:00Z'))).toBe('2026-11-01');
    expect(monthWindow('2026-12').next).toBe('2027-01-01');
    expect(isMonthEnd(new Date('2028-02-24T06:00:00Z'))).toBe(false);
    expect(isMonthEnd(new Date('2028-02-25T06:00:00Z'))).toBe(true);
    expect(isMonthEnd(new Date('2026-10-27T06:00:00Z'))).toBe(true);
    expect(isMonthEnd(new Date('2026-10-31T18:30:00Z'))).toBe(false);
    expect(() => monthWindow('2026-13')).toThrow();
  });
  it('includes carried-forward open tasks and tasks completed in the reporting month', () => {
    const task = { created: '2026-09-01T00:00:00Z', updated: '2026-09-01T00:00:00Z', status: 'PROGRESS' } as AssignedTask;
    expect(taskInMonth(task, '2026-10')).toBe(true);
    expect(taskInMonth({ ...task, status: 'END', completed_at: '2026-09-30T18:29:59Z' }, '2026-10')).toBe(false);
    expect(taskInMonth({ ...task, status: 'END', completed_at: '2026-09-30T18:30:00Z' }, '2026-10')).toBe(true);
    expect(taskInMonth({ ...task, created: '2026-10-31T18:30:00Z' }, '2026-10')).toBe(false);
  });
  it('produces real XLSX with literal task text, including formula-like input', async () => {
    const sheet = taskSheet('Assigned tasks', [{ id: 'task-1', project_number: 3, project_name: 'Vyoma', description: '=HYPERLINK("https://example.test")', employee_name: 'Employee', status: 'PROGRESS', created: '2026-10-08T03:30:00Z' } as AssignedTask]);
    const blob = await writeXlsxFile([sheet]).toBlob();
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    const files = unzipSync(new Uint8Array(buffer));
    expect(files['xl/workbook.xml']).toBeDefined();
    const xml = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(xml).not.toContain('<f>');
    const content = Object.entries(files).filter(([name]) => name.endsWith('.xml')).map(([, value]) => strFromU8(value)).join('');
    expect(content).toContain('Vyoma');
    expect(content).toContain('HYPERLINK');
    expect(content).toContain('In progress');
  });
});
