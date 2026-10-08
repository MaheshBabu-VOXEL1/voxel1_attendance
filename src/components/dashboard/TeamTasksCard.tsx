import { taskStatusStyles } from '../../utils/taskStatusStyles';
import { useAssignedTasks } from '../../hooks/useAssignedTasks';
import { statusLabel } from '../../services/assignedTask.service';
export const TeamTasksCard = ({ onNavigate }: { teamSize?: number; onNavigate: (path: string, params?: any) => void }) => {
  const { tasks, loading, error } = useAssignedTasks();
  const completed = tasks.filter(task => task.status === 'END').length;
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold text-slate-900">Task Progress</h2><span className="text-sm font-semibold text-emerald-700">{completed} completed / {tasks.length} assigned</span></div>
    {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : loading ? <p>Loading progress…</p> : !tasks.length ? <p className="text-sm text-slate-500">No tasks assigned yet.</p> : tasks.map(task => <div key={task.id} className="border-t border-slate-100 pt-3">
      <div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold">{task.employee_name}</p><span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${taskStatusStyles[task.status].badge}`}>{statusLabel[task.status]}</span></div>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{task.description}</p>
    </div>)}
    <button onClick={() => onNavigate('team-tasks', { tab: 'PROGRESS' })} className="min-h-12 rounded-xl bg-primary-light px-4 py-3 text-sm font-semibold text-primary">View Progress</button>
  </section>;
};

