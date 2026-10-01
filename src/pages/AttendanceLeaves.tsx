import React, { useEffect, useState } from 'react';
import { AttendanceSessionButton } from '../components/attendance/AttendanceSessionButton';
import { hrService } from '../services/hrService';
import { CalendarDays, History } from 'lucide-react';
import { User, Attendance, AppConfig } from '../types';
import Leave from './Leave';
import AttendanceLogs from './AttendanceLogs';

type Tab = 'LEAVES' | 'ATTENDANCE';

interface Props {
  user: User;
  tab: Tab;
  onNavigate: (path: string, params?: any) => void;
  filterEmployeeId?: string;
  autoOpen?: boolean;
  openLeaveId?: string;
}

const AttendanceLeaves: React.FC<Props> = ({ user, tab, onNavigate, filterEmployeeId, autoOpen, openLeaveId }) => {
  const [activeShift, setActiveShift] = useState<Attendance>();
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    Promise.all([hrService.getActiveAttendance(user.id), hrService.getConfig()])
      .then(([shift, config]) => { if (active) { setActiveShift(shift); setAppConfig(config); setError(''); } })
      .catch(() => { if (active) setError('Could not load attendance status. Please refresh.'); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [user.id]);
  return (
  <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-xl font-semibold text-slate-900">Attendance and Leaves</h1>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <AttendanceSessionButton activeShift={activeShift} appConfig={appConfig} isLoading={isLoading} onNavigate={onNavigate} />}
    </header>
    <div className="inline-flex p-1 bg-slate-100 rounded-xl" role="tablist" aria-label="Attendance and Leaves">
      {([
        { id: 'ATTENDANCE', label: 'Attendance', Icon: History, path: 'attendance-logs' },
        { id: 'LEAVES', label: 'Leaves', Icon: CalendarDays, path: 'leave' },
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

    {tab === 'LEAVES'
      ? <Leave user={user} autoOpen={autoOpen} openLeaveId={openLeaveId} />
      : <AttendanceLogs user={user} viewMode="MY" filterEmployeeId={filterEmployeeId} />}
  </div>
  );
};

export default AttendanceLeaves;
