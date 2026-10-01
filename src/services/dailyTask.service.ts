import { supabase } from './supabase';
import { apiClient } from './api.client';
import { isOfflineMode } from './offlineMode';

export interface DailyTask {
  id: string;
  employeeId: string;
  employeeName: string;
  taskDate: string;   // YYYY-MM-DD (employee's local date)
  tasks: string;
  /** First submission — the edit window is measured from here. */
  firstSubmittedAt: string;
  /** Latest submission or edit. */
  submittedAt: string;
}

/** Employees may edit their Today Task for this long after first submitting (matches the DB policy). */
export const TASK_EDIT_WINDOW_MS = 60 * 60 * 1000;

/** When the task stops being editable. */
export const editDeadline = (task: DailyTask): Date =>
  new Date(new Date(task.firstSubmittedAt).getTime() + TASK_EDIT_WINDOW_MS);

export const isTaskLocked = (task: DailyTask, now = Date.now()): boolean =>
  now >= editDeadline(task).getTime();

/** Today's date in the user's local timezone, as YYYY-MM-DD. */
export const todayLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const mapRow = (r: any): DailyTask => ({
  id: r.id,
  employeeId: r.employee_id,
  employeeName: r.employee_name || 'Employee',
  taskDate: r.task_date,
  tasks: r.tasks || '',
  firstSubmittedAt: r.created,
  submittedAt: r.updated || r.created,
});

const LOCKED_MESSAGE = "Today's tasks can only be edited within 1 hour of submitting.";

// Offline mode keeps submissions in this browser only, so the flow can be tried without a database.
const OFFLINE_KEY = 'voxel1_offline_daily_tasks';
const readOffline = (): DailyTask[] => {
  try {
    const rows: DailyTask[] = JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]');
    return rows.map(r => ({ ...r, firstSubmittedAt: r.firstSubmittedAt || r.submittedAt }));
  } catch { return []; }
};
const writeOffline = (rows: DailyTask[]) => {
  try { localStorage.setItem(OFFLINE_KEY, JSON.stringify(rows)); } catch { /* storage unavailable */ }
};

export const dailyTaskService = {
  async getMyTask(employeeId: string, date = todayLocal()): Promise<DailyTask | null> {
    if (isOfflineMode) {
      return readOffline().find(t => t.employeeId === employeeId && t.taskDate === date) || null;
    }
    const { data, error } = await supabase
      .from('daily_tasks')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('task_date', date)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapRow(data) : null;
  },

  /** Create or replace the employee's task list for the day. */
  async submitMyTask(employeeId: string, employeeName: string, tasks: string, date = todayLocal()): Promise<DailyTask> {
    const text = tasks.trim();
    if (!text) throw new Error('Please enter at least one task.');

    if (isOfflineMode) {
      const all = readOffline();
      const previous = all.find(t => t.employeeId === employeeId && t.taskDate === date);
      if (previous && isTaskLocked(previous)) throw new Error(LOCKED_MESSAGE);
      const now = new Date().toISOString();
      const row: DailyTask = {
        id: `offline-${employeeId}-${date}`,
        employeeId,
        employeeName,
        taskDate: date,
        tasks: text,
        firstSubmittedAt: previous?.firstSubmittedAt || previous?.submittedAt || now,
        submittedAt: now,
      };
      writeOffline([...all.filter(t => t !== previous), row]);
      return row;
    }

    const previous = await dailyTaskService.getMyTask(employeeId, date);
    if (previous && isTaskLocked(previous)) throw new Error(LOCKED_MESSAGE);

    // organization_id / employee_name / line_manager_id are overwritten from the profile by a DB trigger.
    const { data, error } = await supabase
      .from('daily_tasks')
      .upsert(
        { employee_id: employeeId, task_date: date, tasks: text, organization_id: apiClient.getOrganizationId() },
        { onConflict: 'employee_id,task_date' },
      )
      .select('*')
      .single();
    // The DB policy rejects late edits too (e.g. if the window closed between the check above and this save):
    // the blocked update returns no row, which .single() reports as PGRST116.
    if (error) throw new Error(previous && error.code === 'PGRST116' ? LOCKED_MESSAGE : error.message);
    return mapRow(data);
  },

  /**
   * Tasks submitted for a date that the caller may see: a manager gets their
   * direct reports, HR/Admin get the whole organization (enforced by RLS).
   */
  async getTeamTasks(date = todayLocal()): Promise<DailyTask[]> {
    if (isOfflineMode) {
      return readOffline().filter(t => t.taskDate === date);
    }
    const { data, error } = await supabase
      .from('daily_tasks')
      .select('*')
      .eq('task_date', date)
      .order('employee_name', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(mapRow);
  },

  /** Tasks the caller may see for a range of dates (inclusive), for the sheet view. */
  async getTeamTasksRange(since: string, until: string): Promise<DailyTask[]> {
    if (isOfflineMode) {
      return readOffline().filter(t => t.taskDate >= since && t.taskDate <= until);
    }
    const { data, error } = await supabase
      .from('daily_tasks')
      .select('*')
      .gte('task_date', since)
      .lte('task_date', until)
      .order('task_date', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map(mapRow);
  },
};
