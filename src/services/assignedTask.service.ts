import { supabase } from './supabase';

export type TaskStatus = 'NOT_STARTED' | 'START' | 'PROGRESS' | 'STUCK' | 'END';
export interface AssignedTask {
  id: string;
  /** null while the task is unassigned (saved by a manager without a person yet). */
  employee_id: string | null;
  employee_name: string | null;
  /** The manager who created the task (for self_created tasks: the employee's line manager). */
  assigned_by?: string;
  manager_name: string;
  description: string;
  project_id?: string | null;
  project_number?: number | null;
  due_date?: string | null;
  /** Due today, to be finished within half a day (manager picked Half Day). */
  half_day?: boolean;
  /** Working time before the current running stretch (Pause / Stuck / Done stop the clock). */
  worked_seconds?: number;
  /** When the current running stretch began; null while paused. */
  work_resumed_at?: string | null;
  project_name?: string | null;
  status: TaskStatus;
  created: string;
  updated: string;
  started_at: string | null;
  completed_at: string | null;
  /** true when the employee wrote the task themselves (My Task) and sent it to their manager. */
  self_created: boolean;
}
export const statusLabel: Record<TaskStatus, string> = {
  NOT_STARTED: 'Not started', START: 'Started', PROGRESS: 'In progress', STUCK: 'Stuck', END: 'Completed',
};
export interface TaskProject { id: string; name: string; project_number: number }
export const assignedTaskService = {
  /** Account-switch members who can be assigned tasks even while in Manager mode. */
  async listModeSwitcherIds(): Promise<string[]> {
    const { data, error } = await supabase.rpc('mode_switcher_ids');
    if (error) throw new Error(error.message);
    return (data || []) as string[];
  },
  /** The organization's projects, including ones with no tasks yet (task_projects is read through this function only). */
  async listProjects(): Promise<TaskProject[]> {
    const { data, error } = await supabase.rpc('list_task_projects');
    if (error) throw new Error(error.message);
    return data || [];
  },
  /** Creates a project, or returns the existing one with the same name. */
  async createProject(name: string): Promise<TaskProject> {
    const { data, error } = await supabase.rpc('create_task_project', { p_name: name.trim() });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('Could not create the project.');
    return row;
  },
  async list(employeeId?: string): Promise<AssignedTask[]> {
    const rows: AssignedTask[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = supabase.from('assigned_tasks').select('*').order('created', { ascending: false }).order('id').range(offset, offset + 499);
      if (employeeId) query = query.eq('employee_id', employeeId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      rows.push(...(data || []));
      if (!data || data.length < 500) return rows;
    }
  },
  async assign(employeeId: string, description: string, projectName: string, dueDate: string, status: TaskStatus = 'NOT_STARTED'): Promise<AssignedTask> {
    if (!projectName.trim()) throw new Error('Choose or add a project.');
    const { data, error } = await supabase.rpc('assign_employee_task', { p_employee_id: employeeId, p_description: description.trim(), p_project_name: projectName.trim(), p_due_date: dueDate || null, p_status: status });
    if (error) throw new Error(error.message);
    return data;
  },
  /** Save a task with no person yet; it appears on the organization's shared manager board. */
  async createUnassigned(description: string, projectName: string, dueDate: string): Promise<AssignedTask> {
    if (!projectName.trim()) throw new Error('Choose or add a project.');
    const { data, error } = await supabase.rpc('create_unassigned_task', { p_description: description.trim(), p_project_name: projectName.trim(), p_due_date: dueDate || null });
    if (error) throw new Error(error.message);
    return data;
  },
  async assignLater(taskId: string, employeeId: string, dueDate: string): Promise<AssignedTask> {
    const { data, error } = await supabase.rpc('assign_unassigned_task', { p_task_id: taskId, p_employee_id: employeeId, p_due_date: dueDate || null });
    if (error) throw new Error(error.message);
    return data;
  },
  /** Manager edit of a task they created; every field is written (pass the current values for unchanged ones). employeeId null = back to unassigned. */
  async managerUpdate(taskId: string, f: { description: string; projectName: string; employeeId: string | null; dueDate: string | null; status: TaskStatus }): Promise<AssignedTask> {
    const { data, error } = await supabase.rpc('manager_update_task', { p_task_id: taskId, p_description: f.description.trim(), p_project_name: f.projectName.trim(), p_employee_id: f.employeeId, p_due_date: f.dueDate || null, p_status: f.status });
    if (error) throw new Error(error.message);
    return data;
  },
  /** Marks a task the manager created as a half-day task (due today), or clears the mark. */
  async setHalfDay(taskId: string, halfDay: boolean): Promise<AssignedTask> {
    const { data, error } = await supabase.rpc('set_task_half_day', { p_task_id: taskId, p_half_day: halfDay });
    if (error) throw new Error(error.message);
    return data;
  },
  async managerDelete(taskId: string): Promise<void> {
    const { error } = await supabase.rpc('manager_delete_task', { p_task_id: taskId });
    if (error) throw new Error(error.message);
  },
  async createOwn(description: string, status: Exclude<TaskStatus, 'NOT_STARTED'>): Promise<AssignedTask> {
    const { data, error } = await supabase.rpc('create_own_task', { p_description: description.trim(), p_status: status });
    if (error) throw new Error(error.message);
    return data;
  },
  async setStatus(taskId: string, status: TaskStatus): Promise<AssignedTask> {
    const { data, error } = await supabase.rpc('set_assigned_task_status', { p_task_id: taskId, p_status: status });
    if (error) throw new Error(error.message);
    return data;
  },
};
