
import React from 'react';
import { AttendanceSessionButton } from '../attendance/AttendanceSessionButton';
import { Building2 } from 'lucide-react';
import { Employee, Attendance, AppConfig } from '../../types';
import { accountTypeLabel } from '../../utils/accountTypeLabel';

interface Props {
  user: Employee;
  activeShift?: Attendance;
  appConfig: AppConfig | null;
  isLoading: boolean;
  onNavigate: (path: string) => void;
  /** False for the Manager, who does not mark attendance. */
  showAttendance?: boolean;
}

export const DashboardHeader: React.FC<Props> = ({ user, activeShift, appConfig, isLoading, onNavigate, showAttendance = true }) => {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 md:gap-6">
      <div>
        {appConfig?.companyName && (
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={12} className="text-primary" />
            <p className="text-[10px] font-semibold text-primary uppercase tracking-[0.2em]">{appConfig.companyName}</p>
          </div>
        )}
        <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 tracking-tight">{user.name}</h1>
        <p className="text-xs font-bold text-slate-400 mt-0.5">{accountTypeLabel(user.role)}</p>
      </div>
      
      {showAttendance && (
      <AttendanceSessionButton activeShift={activeShift} appConfig={appConfig} isLoading={isLoading} onNavigate={onNavigate} />
      )}
    </header>
  );
};
