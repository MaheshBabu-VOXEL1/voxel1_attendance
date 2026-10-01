import React, { useState } from 'react';
import { User } from '../types';
import { useAssignedTasks } from '../hooks/useAssignedTasks';
import { AssignedTaskList } from '../components/tasks/AssignedTaskList';
import { assignedTaskService, TaskStatus } from '../services/assignedTask.service';
import { taskStatusStyles } from '../utils/taskStatusStyles';

type OwnStatus = Exclude<TaskStatus, 'NOT_STARTED'>;

/** Employee tasks: Given Task (assigned by the manager) and My Task (written by the employee, sent to the manager). */
export default function TodayTask({ user }: { user: User }) {
  const [tab, setTab] = useState<'GIVEN' | 'MINE'>('GIVEN');
  const { tasks, loading, error, refresh } = useAssignedTasks(user.id);
  const given = tasks.filter(t => !t.self_created);
  const mine = tasks.filter(t => t.self_created);

  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<OwnStatus | ''>('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [message, setMessage] = useState('');

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !description.trim() || !status) return;
    setSaving(true); setFormError(''); setMessage('');
    try {
      await assignedTaskService.createOwn(description, status);
      setDescription(''); setStatus(''); setMessage('Task sent to your manager.');
      await refresh();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not send task.'); }
    finally { setSaving(false); }
  };

  return <div className="max-w-3xl space-y-5 pb-20">
    <div role="tablist" aria-label="Tasks" className="inline-flex rounded-xl bg-slate-100 p-1">
      {(['GIVEN', 'MINE'] as const).map(value => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-lg px-5 py-3 text-sm font-semibold ${tab === value ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}>{value === 'GIVEN' ? 'Given Task' : 'My Task'}</button>)}
    </div>

    {tab === 'GIVEN' ? <>
      <div><h1 className="text-xl font-semibold text-slate-900">Given Task</h1><p className="mt-1 text-sm text-slate-500">Tasks assigned by your manager. Select End when a task is completed.</p></div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading ? <p role="status" className="text-sm text-slate-500">Loading tasks…</p> : <AssignedTaskList tasks={given} editable onUpdated={refresh} />}
    </> : <>
      <div><h1 className="text-xl font-semibold text-slate-900">My Task</h1><p className="mt-1 text-sm text-slate-500">Write what you are working on, choose its status and send it to your manager.</p></div>
      <form onSubmit={send} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
        <div><label htmlFor="own-task" className="mb-2 block text-sm font-semibold">Task</label>
          <textarea id="own-task" required maxLength={4000} rows={4} value={description} onChange={e => setDescription(e.target.value)} disabled={saving} placeholder="What are you working on?" className="w-full rounded-xl border border-slate-200 p-3 text-sm" /></div>
        <fieldset disabled={saving} className="flex flex-wrap gap-3">
          <legend className="mb-2 text-sm font-semibold">Status</legend>
          {(['START', 'PROGRESS', 'END'] as const).map((value, index) => <label key={value} className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border px-3 py-3 text-sm font-semibold ${status === value ? taskStatusStyles[value].selected : taskStatusStyles[value].option}`}>
            <input type="radio" name="own-task-status" value={value} checked={status === value} onChange={() => setStatus(value)} className={`h-4 w-4 ${taskStatusStyles[value].radio}`} />
            {['Started', 'Progress', 'End'][index]}
          </label>)}
        </fieldset>
        {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        <button type="submit" disabled={saving || !description.trim() || !status} className="min-h-12 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Sending…' : 'Send'}</button>
      </form>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {loading ? <p role="status" className="text-sm text-slate-500">Loading tasks…</p> : <AssignedTaskList tasks={mine} editable onUpdated={refresh} emptyText="You have not sent any tasks yet." />}
    </>}
  </div>;
}
