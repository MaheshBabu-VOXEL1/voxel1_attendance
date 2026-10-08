import React, { useEffect, useState } from 'react';
import { User, Employee } from '../types';
import { employeeService } from '../services/employee.service';
import { assignedTaskService, statusLabel, TaskStatus } from '../services/assignedTask.service';
import { useAssignedTasks } from '../hooks/useAssignedTasks';
import { AssignedTaskList } from '../components/tasks/AssignedTaskList';

export default function TeamTasks({ user, initialTab }: { user: User; initialTab?: string }) {
  const [tab, setTab] = useState<'ASSIGN' | 'PROGRESS' | 'EMPLOYEE'>(initialTab === 'PROGRESS' || initialTab === 'EMPLOYEE' ? initialTab : 'ASSIGN');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [description, setDescription] = useState('');
  const [project, setProject] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<TaskStatus>('NOT_STARTED');
  const [newProject, setNewProject] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [saving, setSaving] = useState(false);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');
  const { tasks: allTasks, loading, error, refresh } = useAssignedTasks();
  // Progress shows tasks the manager assigned; Employee Task shows tasks employees wrote themselves (My Task).
  const tasks = allTasks.filter(t => !t.self_created);
  const employeeTasks = allTasks.filter(t => t.self_created);
  const projects = Array.from(new Set(allTasks.map(t => t.project_name).filter((name): name is string => !!name))).sort((a, b) => a.localeCompare(b));
  const projectName = project === '__new__' ? newProject.trim() : project;
  const visibleTasks = (tab === 'EMPLOYEE' ? employeeTasks : tasks)
    .filter(t => !projectFilter || t.project_name === projectFilter)
    .sort((a, b) => sortBy === 'project'
      ? (a.project_name || '\uffff').localeCompare(b.project_name || '\uffff') || b.created.localeCompare(a.created)
      : b.created.localeCompare(a.created));
  useEffect(() => {
    let active = true;
    employeeService.getEmployees().then(rows => {
      // Managers can assign to any active employee in the organization, not only direct reports.
      if (active) setEmployees(rows.filter(e => e.role === 'EMPLOYEE' && e.status !== 'INACTIVE'));
    }).catch(e => active && setFormError(e.message)).finally(() => active && setEmployeesLoading(false));
    return () => { active = false; };
  }, [user.id, user.role]);
  const assign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !employeeId || !description.trim() || !projectName || !dueDate) return;
    setSaving(true); setFormError(''); setMessage('');
    try {
      const existingProject = projects.find(name => name.toLowerCase() === projectName.toLowerCase());
      await assignedTaskService.assign(employeeId, description, existingProject || projectName, dueDate, status);
      setDueDate(''); setStatus('NOT_STARTED'); setDescription(''); setProject(''); setNewProject(''); setProjectFilter(''); setMessage('Task assigned. Your employee can now see it.'); await refresh(); setTab('PROGRESS');
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not assign task.'); }
    finally { setSaving(false); }
  };
  const completed = tasks.filter(t => t.status === 'END').length;
  return <div className="max-w-7xl space-y-6 pb-20">
    <div><h1 className="text-xl font-semibold text-slate-900">Team Tasks</h1><p className="mt-1 text-sm text-slate-500">Assign work and follow your team's progress.</p></div>
    <div role="tablist" aria-label="Team tasks" className="inline-flex rounded-xl bg-slate-100 p-1">
      {(['ASSIGN','PROGRESS','EMPLOYEE'] as const).map(value => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-lg px-5 py-3 text-sm font-semibold ${tab === value ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>{value === 'ASSIGN' ? 'Assign Task' : value === 'PROGRESS' ? 'Progress' : 'Employee Task'}</button>)}
    </div>
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {tab !== 'ASSIGN' && <div className="flex flex-wrap gap-4">
      <div><label htmlFor="filter-project" className="mb-2 block text-sm font-semibold">Filter by project</label><select id="filter-project" value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-white p-3 text-sm"><option value="">All projects</option>{projects.map(name => <option key={name} value={name}>{name}</option>)}</select></div>
      <div><label htmlFor="sort-tasks" className="mb-2 block text-sm font-semibold">Sort tasks</label><select id="sort-tasks" value={sortBy} onChange={e => setSortBy(e.target.value)} className="min-h-12 rounded-xl border border-slate-200 bg-white p-3 text-sm"><option value="newest">Newest first</option><option value="project">Project name (A–Z)</option></select></div>
    </div>}
    {tab === 'ASSIGN' ? <form onSubmit={assign} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div><h2 className="font-semibold text-slate-900">Assign project tasks</h2><p className="mt-1 text-sm text-slate-500">Choose a project and assign work to your team. Each project keeps the same unique ID.</p></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-slate-600"><tr>{['Project UID', 'Project Selection', 'Task Description', 'Due Date', 'Person', 'Status'].map(label => <th key={label} scope="col" className="border border-slate-200 p-3 font-semibold">{label}</th>)}</tr></thead>
          <tbody>
            <tr className="align-top">
              <td className="border border-slate-200 p-3"><span className="block max-w-36 break-all font-mono text-xs text-slate-500">{allTasks.find(t => t.project_name === project)?.project_id || 'Generated on save'}</span></td>
              <td className="border border-slate-200 p-3 min-w-48"><select aria-label="Project Selection" required value={project} disabled={saving || loading} onChange={e => setProject(e.target.value)} className="min-h-12 w-full rounded-lg border border-slate-200 bg-white p-2"><option value="">Choose a project</option>{projects.map(name => <option key={name} value={name}>{name}</option>)}<option value="__new__">+ Add new project</option></select>
                {project === '__new__' && <input aria-label="New project name" required maxLength={200} value={newProject} disabled={saving} onChange={e => setNewProject(e.target.value)} placeholder="New project name" className="mt-2 min-h-12 w-full rounded-lg border border-slate-200 p-2" />}</td>
              <td className="border border-slate-200 p-3 min-w-64"><textarea aria-label="Task Description" required maxLength={4000} rows={3} value={description} onChange={e => setDescription(e.target.value)} disabled={saving} placeholder="Describe the task" className="w-full rounded-lg border border-slate-200 p-2" /></td>
              <td className="border border-slate-200 p-3"><input aria-label="Due Date" type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={saving} className="min-h-12 rounded-lg border border-slate-200 p-2" /></td>
              <td className="border border-slate-200 p-3 min-w-48"><select aria-label="Person" required value={employeeId} onChange={e => setEmployeeId(e.target.value)} disabled={employeesLoading || saving} className="min-h-12 w-full rounded-lg border border-slate-200 bg-white p-2"><option value="">{employeesLoading ? 'Loading employees…' : 'Choose a person'}</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></td>
              <td className="border border-slate-200 p-3 min-w-40"><select aria-label="Status" value={status} onChange={e => setStatus(e.target.value as TaskStatus)} disabled={saving} className="min-h-12 w-full rounded-lg border border-slate-200 bg-white p-2">{(['NOT_STARTED', 'START', 'PROGRESS', 'END'] as const).map(value => <option key={value} value={value}>{statusLabel[value]}</option>)}</select></td>
            </tr>
            {tasks.map(task => <tr key={task.id} className="align-top text-slate-700"><td className="border border-slate-200 p-3"><span className="block max-w-36 break-all font-mono text-xs">{task.project_id || '—'}</span></td><td className="border border-slate-200 p-3">{task.project_name || '—'}</td><td className="border border-slate-200 p-3 whitespace-pre-wrap break-words max-w-sm">{task.description}</td><td className="border border-slate-200 p-3 whitespace-nowrap">{task.due_date ? new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-GB') : '—'}</td><td className="border border-slate-200 p-3">{task.employee_name}</td><td className="border border-slate-200 p-3">{statusLabel[task.status]}</td></tr>)}
          </tbody>
        </table>
      </div>
      {!employeesLoading && !employees.length && <p className="text-sm text-slate-500">No active employees assigned to you yet.</p>}
      {(formError || error) && <p role="alert" className="text-sm text-red-600">{formError || error}</p>}
      <button type="submit" disabled={saving || loading || !employeeId || !description.trim() || !projectName || !dueDate} className="min-h-12 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Assigning…' : 'Assign Task'}</button>
    </form> : tab === 'EMPLOYEE' ? <div role="tabpanel" className="space-y-4">
      <p className="text-sm text-slate-600">{employeeTasks.filter(t => t.status === 'END').length} completed · {employeeTasks.filter(t => t.status !== 'END').length} open · Written by your employees · Updates automatically</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading tasks…</p> : <AssignedTaskList tasks={visibleTasks} emptyText={projectFilter ? 'No tasks for this project.' : 'No tasks sent by employees yet.'} />}
    </div> : <div role="tabpanel" className="space-y-4">
      <p className="text-sm text-slate-600">{completed} completed · {tasks.length - completed} open · Updates automatically</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading ? <p role="status">Loading progress…</p> : <AssignedTaskList tasks={visibleTasks} emptyText={projectFilter ? 'No tasks for this project.' : 'No tasks assigned yet.'} />}
    </div>}
  </div>;
}

