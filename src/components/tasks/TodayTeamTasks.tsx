import { useEffect, useState } from 'react';
import { assignedTaskService, AssignedTask, TaskComment, TaskStatus } from '../../services/assignedTask.service';
import { Employee } from '../../types';

export const indiaDay = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};
export function isTodayTask(task: AssignedTask, day: string, notes: TaskComment[]) {
  if (task.occurrence_date && task.occurrence_date > day) return false;
  return task.status === 'START' || task.status === 'PROGRESS' || task.status === 'STUCK'
    || [task.started_at, task.work_resumed_at, task.stuck_at, task.completed_at, task.updated]
      .some(value => value && indiaDay(value) === day)
    || notes.some(note => note.task_id === task.id && indiaDay(note.created_at) === day);
}
const labels: Record<TaskStatus, string> = { NOT_STARTED: 'Not started', START: 'In progress', PROGRESS: 'In progress', STUCK: 'Stuck', END: 'Done' };
const time = (value: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date(value));

export default function TodayTeamTasks({ tasks, employees, project, query, loading, onOpen }: {
  tasks: AssignedTask[]; employees: Employee[]; project: string; query: string; loading: boolean; onOpen: (id: string) => void;
}) {
  const day = indiaDay(new Date().toISOString());
  const [notes, setNotes] = useState<TaskComment[]>([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    let version = 0;
    const load = async () => {
      const request = ++version;
      const since = new Date(`${day}T00:00:00+05:30`);
      try {
        const rows = await assignedTaskService.listDailyComments(since.toISOString(), new Date(since.getTime() + 86400000).toISOString());
        if (alive && request === version) { setNotes(rows); setError(''); }
      } catch { if (alive && request === version) setError('Could not load today’s comments.'); }
      finally { if (alive && request === version) setPending(false); }
    };
    setPending(true);
    void load();
    const tick = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(tick, 10000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, [day, retry]);
  const daily = tasks.filter(t => t.employee_id && isTodayTask(t, day, notes) && (project === 'all' || t.project_name === project));
  // Keep people visible even when they have no daily update. Only the active roster is shown, so people who left drop off.
  const roster = new Map(employees.map(e => [e.id, { id: e.id, name: e.name }]));
  const rows = [...roster.values()].sort((a, b) => a.name.localeCompare(b.name)).map(person => ({
    person, work: daily.filter(t => t.employee_id === person.id),
  })).filter(({ person, work }) => {
    if (project !== 'all' && !work.length) return false;
    if (filter === 'No update' ? work.length > 0 : filter !== 'All' && !work.some(t => labels[t.status] === filter)) return false;
    return !query.trim() || `${person.name} ${work.map(t => `${t.description} ${t.project_name || ''} ${notes.filter(n => n.task_id === t.id).map(n => n.body).join(' ')}`).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  return <section aria-label="Today's team updates">
    <div className="fbar" role="group" aria-label="Filter daily updates">{['All', 'In progress', 'Stuck', 'Done', 'No update'].map(label =>
      <button key={label} className="fchip" aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}</div>
    <div className="sec"><h2>Today’s team tasks</h2><span>{day}</span></div>
    <p className="hint">Active work and tasks updated today · India time</p>
    {error && <p className="alert" role="alert">{error} <button className="btn" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
    {loading || pending ? <p role="status" className="loading">Loading daily updates…</p> : rows.length ? rows.map(({ person, work }) =>
      <article className="card today-person" key={person.id}>
        <div className="today-person-head"><span className="av">{person.name.split(/\s+/).map(n => n[0]).join('').slice(0, 2)}</span><h3>{person.name}</h3></div>
        {!work.length && <p className="today-no-update">{error ? 'Daily updates unavailable' : 'No update today'}</p>}
        {work.filter(t => filter === 'All' || labels[t.status] === filter).map(task => {
          const comment = notes.filter(n => n.task_id === task.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
          return <div className="today-work" key={task.id}>
            <div className="today-task-head"><button className="tt" onClick={() => onOpen(task.id)}>{task.description}</button><span className={`today-status ${task.status.toLowerCase()}`}>{labels[task.status]}</span></div>
            <p className="task-attribution">{task.project_name || 'No project'}</p>
            {comment ? <div className="today-comment"><small>{comment.author_name} · {time(comment.created_at)}</small><p>{comment.body}</p></div>
              : <p className="hint">{error ? 'Comments unavailable' : 'No comments today'}</p>}
            {!comment && task.status === 'STUCK' && task.stuck_reason && <p className="stuck-note">{task.stuck_reason}</p>}
          </div>;
        })}
      </article>) : <div className="card empty">No team updates match these filters.</div>}
  </section>;
}
