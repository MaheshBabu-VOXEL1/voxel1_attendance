import React, { useState } from 'react';
import { taskStatusStyles } from '../../utils/taskStatusStyles';
import { AssignedTask, assignedTaskService, statusLabel, TaskStatus } from '../../services/assignedTask.service';

export function AssignedTaskList({ tasks, editable = false, onUpdated, emptyText = 'No tasks assigned yet.' }: {
  tasks: AssignedTask[]; editable?: boolean; onUpdated?: () => Promise<void>; emptyText?: string;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const update = async (task: AssignedTask, status: Exclude<TaskStatus, 'NOT_STARTED'>) => {
    if (saving || task.status === status) return;
    setSaving(task.id); setError('');
    try { await assignedTaskService.setStatus(task.id, status); await onUpdated?.(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update status. Please try again.'); }
    finally { setSaving(null); }
  };
  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!tasks.length && <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{emptyText}</p>}
    {tasks.map(task => <article key={task.id} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{!editable ? task.employee_name : task.self_created ? 'Sent to ' + task.manager_name : 'Assigned by ' + task.manager_name}</p>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${taskStatusStyles[task.status].badge}`}>{statusLabel[task.status]}</span>
      </div>
      <p className="text-xs font-semibold text-primary">Project: {task.project_name || 'No project'}</p>
      <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{task.description}</p>
      <p className="text-xs text-slate-500">{task.self_created ? 'Sent' : 'Assigned'} {new Date(task.created).toLocaleString()}</p>
      {editable && <fieldset disabled={saving !== null} className="flex flex-wrap gap-3">
        <legend className="mb-2 text-xs font-semibold text-slate-600">Update your task status</legend>
        {(['START', 'PROGRESS', 'END'] as const).map((status, index) => <label key={status} className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border px-3 py-3 text-sm font-semibold ${task.status === status ? taskStatusStyles[status].selected : taskStatusStyles[status].option}`}>
          <input type="radio" name={'status-' + task.id} value={status} checked={task.status === status} onChange={() => void update(task, status)} className={`h-4 w-4 ${taskStatusStyles[status].radio}`} />
          {['Start','Progress','End'][index]}
        </label>)}
      </fieldset>}
      {saving === task.id && <p role="status" className="text-xs text-primary">Saving status…</p>}
      {task.started_at && <p className="text-xs font-medium text-blue-700">Started {new Date(task.started_at).toLocaleString()}</p>}
      {task.completed_at && <p className="text-xs font-medium text-green-700">Completed {new Date(task.completed_at).toLocaleString()}</p>}
    </article>)}
  </div>;
}

