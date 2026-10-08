import type { Sheet, SheetData } from 'write-excel-file/browser';
import { AssignedTask, statusLabel } from '../services/assignedTask.service';

export const indiaDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

export function monthWindow(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.');
  const [year, m] = month.split('-').map(Number);
  const next = `${m === 12 ? year + 1 : year}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
  return { start: `${month}-01`, next, startTime: `${month}-01T00:00:00+05:30`, nextTime: `${next}T00:00:00+05:30` };
}

export function isMonthEnd(date = new Date()) {
  const [year, month, day] = indiaDate(date).split('-').map(Number);
  return day > new Date(Date.UTC(year, month, 0)).getUTCDate() - 5;
}

export function taskInMonth(task: AssignedTask, month: string) {
  const { startTime, nextTime } = monthWindow(month);
  return new Date(task.created).getTime() < new Date(nextTime).getTime()
    && (task.status !== 'END' || new Date(task.completed_at || task.updated || task.created).getTime() >= new Date(startTime).getTime());
}

export const indiaTimestamp = (value?: string | null) => value ? new Date(value).toLocaleString('en-GB', {
  timeZone: 'Asia/Kolkata', hour12: false,
}) : '';

export function reportSheet(name: string, headers: string[], rows: (string | number | null | undefined)[][]): Sheet<Blob> {
  const data: SheetData = [headers.map(value => ({ value, type: String, fontWeight: 'bold', backgroundColor: '#E8EFF8' })),
    ...rows.map(row => row.map(value => typeof value === 'number'
      ? { value, type: Number } : { value: value ?? '', type: String, wrap: true }))];
  return { sheet: name, data, columns: headers.map(h => ({ width: h.includes('Description') || h === 'Remarks' ? 55 : 24 })) };
}

export function taskSheet(name: string, tasks: AssignedTask[]) {
  return reportSheet(name, ['Project UID', 'Project Selection', 'Task Description', 'Due Date', 'Person', 'Status', 'Assigned / Sent (IST)', 'Started (IST)', 'Completed (IST)', 'Task ID'],
    tasks.map(t => [t.project_number, t.project_name, t.description, t.due_date, t.employee_name || 'Unassigned', statusLabel[t.status], indiaTimestamp(t.created), indiaTimestamp(t.started_at), indiaTimestamp(t.completed_at), t.id]));
}

export async function downloadWorkbook(sheets: Sheet<Blob>[], name: string) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  await writeXlsxFile(sheets).toFile(name);
}
