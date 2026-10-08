import { taskStatusStyles } from '../../utils/taskStatusStyles';
import { useAssignedTasks } from '../../hooks/useAssignedTasks';
import { statusLabel } from '../../services/assignedTask.service';
export const TodayTaskCard = ({ userId, onNavigate }: { userId: string; onNavigate: (path: string) => void }) => {
  const { tasks: allTasks, loading, error } = useAssignedTasks(userId);
  // Only tasks the manager gave; the employee's own tasks live on the My Task tab.
  const tasks = allTasks.filter(t => !t.self_created);
  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="font-semibold text-slate-900">My Assigned Tasks</h2>
    {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : loading ? <p>Loading tasks…</p> : !tasks.length ? <p className="text-sm text-slate-500">No tasks assigned yet.</p> : tasks.map(task => <div key={task.id} className="border-t border-slate-100 pt-3">
      <p className="whitespace-pre-wrap break-words text-sm text-slate-800">{task.description}</p>
      <p className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-semibold ${taskStatusStyles[task.status].badge}`}>{statusLabel[task.status]}</p>
    </div>)}
    <button onClick={() => onNavigate('today-task')} className="min-h-12 rounded-xl bg-primary-light px-4 py-3 text-sm font-semibold text-primary">Open Task tab</button>
  </section>;
};

