import React, { useEffect, useState } from 'react';
import { User, Employee } from '../types';
import { employeeService } from '../services/employee.service';
import { assignedTaskService } from '../services/assignedTask.service';
import { useAssignedTasks } from '../hooks/useAssignedTasks';
import { AssignedTaskList } from '../components/tasks/AssignedTaskList';

export default function TeamTasks({ user, initialTab }: { user: User; initialTab?: string }) {
  const [tab, setTab] = useState<'ASSIGN' | 'PROGRESS' | 'EMPLOYEE'>(initialTab === 'PROGRESS' || initialTab === 'EMPLOYEE' ? initialTab : 'ASSIGN');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const { tasks: allTasks, loading, error, refresh } = useAssignedTasks();
  // Progress shows tasks the manager assigned; Employee Task shows tasks employees wrote themselves (My Task).
  const tasks = allTasks.filter(t => !t.self_created);
  const employeeTasks = allTasks.filter(t => t.self_created);
  useEffect(() => {
    let active = true;
    employeeService.getEmployees().then(rows => {
      if (active) setEmployees(rows.filter(e => e.role === 'EMPLOYEE' && e.status !== 'INACTIVE' && (user.role === 'ADMIN' || e.lineManagerId === user.id)));
    }).catch(e => active && setFormError(e.message)).finally(() => active && setEmployeesLoading(false));
    return () => { active = false; };
  }, [user.id, user.role]);
  const assign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !employeeId || !description.trim()) return;
    setSaving(true); setFormError(''); setMessage('');
    try {
      await assignedTaskService.assign(employeeId, description);
      setDescription(''); setMessage('Task assigned. Your employee can now see it.'); await refresh(); setTab('PROGRESS');
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not assign task.'); }
    finally { setSaving(false); }
  };
  const completed = tasks.filter(t => t.status === 'END').length;
  return <div className="max-w-4xl space-y-6 pb-20">
    <div><h1 className="text-xl font-semibold text-slate-900">Team Tasks</h1><p className="mt-1 text-sm text-slate-500">Assign work and follow your team's progress.</p></div>
    <div role="tablist" aria-label="Team tasks" className="inline-flex rounded-xl bg-slate-100 p-1">
      {(['ASSIGN','PROGRESS','EMPLOYEE'] as const).map(value => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-lg px-5 py-3 text-sm font-semibold ${tab === value ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>{value === 'ASSIGN' ? 'Assign Task' : value === 'PROGRESS' ? 'Progress' : 'Employee Task'}</button>)}
    </div>
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {tab === 'ASSIGN' ? <form onSubmit={assign} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
      <div><label htmlFor="task-employee" className="mb-2 block text-sm font-semibold">Employee</label>
        <select id="task-employee" required value={employeeId} onChange={e => setEmployeeId(e.target.value)} disabled={employeesLoading || saving} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <option value="">{employeesLoading ? 'Loading employees…' : 'Choose an employee'}</option>
          {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
        </select>
        {!employeesLoading && !employees.length && <p className="mt-2 text-sm text-slate-500">No active employees assigned to you yet.</p>}
      </div>
      <div><label htmlFor="assigned-description" className="mb-2 block text-sm font-semibold">Task</label><textarea id="assigned-description" required maxLength={4000} rows={5} value={description} onChange={e => setDescription(e.target.value)} disabled={saving} placeholder="Describe the task for this employee" className="w-full rounded-xl border border-slate-200 p-3 text-sm" /></div>
      {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
      <button type="submit" disabled={saving || !employeeId || !description.trim()} className="min-h-12 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Assigning…' : 'Assign Task'}</button>
    </form> : tab === 'EMPLOYEE' ? <div role="tabpanel" className="space-y-4">
      <p className="text-sm text-slate-600">{employeeTasks.filter(t => t.status === 'END').length} completed · {employeeTasks.filter(t => t.status !== 'END').length} open · Written by your employees · Updates automatically</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading tasks…</p> : <AssignedTaskList tasks={employeeTasks} emptyText="No tasks sent by employees yet." />}
    </div> : <div role="tabpanel" className="space-y-4">
      <p className="text-sm text-slate-600">{completed} completed · {tasks.length - completed} open · Updates automatically</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading progress…</p> : <AssignedTaskList tasks={tasks} />}
    </div>}
  </div>;
}

