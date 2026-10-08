import { supabase } from './supabase';
import { resolveOrgId } from './api.client';
import { AssignedTask } from './assignedTask.service';
import { downloadWorkbook, indiaTimestamp, monthWindow, reportSheet, taskInMonth, taskSheet } from '../utils/monthlyReports';

// Fetch every page; an incomplete export must never silently look successful.
async function readRows(table: 'attendance' | 'assigned_tasks' | 'profiles', org: string, month: string) {
  const { start, next, nextTime } = monthWindow(month);
  const rows: Record<string, any>[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from(table).select('*').eq('organization_id', org).order('id').range(offset, offset + 499);
    if (table === 'attendance') query = query.gte('date', start).lt('date', next);
    if (table === 'assigned_tasks') query = query.lt('created', nextTime);
    if (table === 'profiles') query = query.eq('role', 'EMPLOYEE');
    const { data, error } = await query;
    if (error) throw new Error(`Could not export ${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

export async function downloadMonthlyReport(month: string) {
  const org = await resolveOrgId();
  if (!org) throw new Error('Sign in again before downloading reports.');
  const [attendance, tasks, employees] = await Promise.all([
    readRows('attendance', org, month), readRows('assigned_tasks', org, month), readRows('profiles', org, month),
  ]);
  const monthlyTasks = (tasks as AssignedTask[]).filter(t => taskInMonth(t, month));
  await downloadWorkbook([
    reportSheet('Report information', ['Item', 'Details'], [
      ['Month', month], ['Timezone', 'Asia/Kolkata (India)'], ['Generated', indiaTimestamp(new Date().toISOString())],
      ['Scope', 'Records accessible to the signed-in account. Attendance covers the selected month. Tasks include unfinished work carried forward and tasks completed during or after that month.'],
      ['Snapshot', 'Download again after final updates. This workbook is a report, not a full database backup.'],
    ]),
    reportSheet('Attendance', ['Employee', 'Date', 'Check In (IST)', 'Check Out (IST)', 'Status', 'Duty Type', 'Remarks', 'Location', 'Record ID'],
      attendance.map(a => [a.employee_name, a.date, indiaTimestamp(a.check_in), indiaTimestamp(a.check_out), a.status, a.duty_type, a.remarks, a.location, a.id])),
    taskSheet('Assigned tasks', monthlyTasks.filter(t => !t.self_created)),
    taskSheet('Employee tasks', monthlyTasks.filter(t => t.self_created)),
    reportSheet('Employees', ['Employee ID', 'Name', 'Department', 'Designation', 'Status', 'Joining Date'],
      employees.map(e => [e.employee_id, e.name, e.department, e.designation, e.status, e.joining_date])),
  ], `voxel1-monthly-report-${month}.xlsx`);
}
