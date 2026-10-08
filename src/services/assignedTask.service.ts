import { supabase } from './supabase';

export type TaskStatus = 'NOT_STARTED' | 'START' | 'PROGRESS' | 'END';
export interface AssignedTask {
  id: string;
  employee_id: string;
  employee_name: string;
  manager_name: string;
  description: string;
  project_id?: string | null;
  project_number?: number | null;
  due_date?: string | null;
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
  NOT_STARTED: 'Not started', START: 'Started', PROGRESS: 'In progress', END: 'Completed',
};
export const assignedTaskService = {
  async list(employeeId?: string): Promise<AssignedTask[]> {
    let query = supabase.from('assigned_tasks').select('*').order('created', { ascending: false });
    if (employeeId) query = query.eq('employee_id', employeeId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  },
  async assign(employeeId: string, description: string, projectName: string, dueDate: string, status: TaskStatus = 'NOT_STARTED'): Promise<AssignedTask> {
    if (!projectName.trim()) throw new Error('Choose or add a project.');
    const { data, error } = await supabase.rpc('assign_employee_task', { p_employee_id: employeeId, p_description: description.trim(), p_project_name: projectName.trim(), p_due_date: dueDate, p_status: status });
    if (error) throw new Error(error.message);
    return data;
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
