
import React from 'react';
import { DashboardData } from '../../hooks/dashboard/useDashboard';
import { DashboardHeader } from './DashboardHeader';
import { TodayTaskCard } from './TodayTaskCard';

interface Props {
  data: DashboardData;
  isLoading: boolean;
  onNavigate: (path: string, params?: any) => void;
}

/** Employee identity and assigned tasks. */
export const EmployeeDashboard: React.FC<Props> = ({ data, isLoading, onNavigate }) => {
  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in duration-700">
      <DashboardHeader
        showAttendance={false}
        user={data.freshUser}
        activeShift={data.activeShift}
        appConfig={data.appConfig}
        isLoading={isLoading}
        onNavigate={onNavigate}
      />
      <TodayTaskCard userId={data.freshUser.id} onNavigate={onNavigate} />
    </div>
  );
};
