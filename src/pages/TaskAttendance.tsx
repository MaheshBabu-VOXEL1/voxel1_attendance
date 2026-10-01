import React from 'react';
import { ListTodo, History } from 'lucide-react';
import { User } from '../types';
import TodayTask from './TodayTask';
import AttendanceLogs from './AttendanceLogs';

type Tab = 'TASK' | 'ATTENDANCE';

interface Props {
  user: User;
  tab: Tab;
  onNavigate: (path: string, params?: any) => void;
  filterEmployeeId?: string;
}

/**
 * The employee "Task & Attendance" page: Today Task and My Attendance as two tabs.
 * Each tab keeps its own address (#/today-task, #/attendance), so switching tabs navigates.
 */
const TaskAttendance: React.FC<Props> = ({ user, tab, onNavigate, filterEmployeeId }) => (
  <div className="space-y-6">
    <div className="inline-flex p-1 bg-slate-100 rounded-xl" role="tablist" aria-label="Task and attendance">
      {([
        { id: 'TASK', label: 'Task', Icon: ListTodo, path: 'today-task' },
        { id: 'ATTENDANCE', label: 'Attendance', Icon: History, path: 'attendance-logs' },
      ] as const).map(({ id, label, Icon, path }) => (
        <button
          key={id}
          role="tab"
          aria-selected={tab === id}
          onClick={() => { if (tab !== id) onNavigate(path); }}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold transition-all ${tab === id ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <Icon size={15} /> {label}
        </button>
      ))}
    </div>

    {tab === 'TASK'
      ? <TodayTask user={user} />
      : <AttendanceLogs user={user} viewMode="MY" filterEmployeeId={filterEmployeeId} />}
  </div>
);

export default TaskAttendance;
