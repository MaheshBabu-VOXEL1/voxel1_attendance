
import React from 'react';
import { DashboardData } from '../../hooks/dashboard/useDashboard';
import { DashboardHeader } from './DashboardHeader';
import { DashboardStats } from './DashboardStats';
import { AnnouncementWidget } from './AnnouncementWidget';
import { TeamTasksCard } from './TeamTasksCard';
import { PendingLeaveRequestsCard } from './PendingLeaveRequestsCard';

interface Props {
  data: DashboardData;
  isLoading: boolean;
  onNavigate: (path: string, params?: any) => void;
}

/** The Manager approves and follows the team; they do not mark attendance or apply for leave. */
export const ManagerDashboard: React.FC<Props> = ({ data, isLoading, onNavigate }) => {

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <DashboardHeader 
        user={data.freshUser} 
        activeShift={data.activeShift} 
        appConfig={data.appConfig} 
        isLoading={isLoading}
        onNavigate={onNavigate} 
        showAttendance={false}
      />

      <DashboardStats 
        leaveUsed={data.leaveUsed} 
        upcomingHoliday={data.upcomingHoliday} 
        isLoading={isLoading} 
        showLeaveUsed={false}
      />

      {!isLoading && (
        <>
          {/* Leave requests waiting for this manager; tap one to review it on the Leave page. */}
          <PendingLeaveRequestsCard managerId={data.freshUser.id} onNavigate={onNavigate} />

          {/* Today Task submissions from direct reports — first, so it's visible without scrolling on a phone */}
          <TeamTasksCard teamSize={data.directReportsCount} onNavigate={onNavigate} />

          {/* Announcements Widget */}
          <AnnouncementWidget user={data.freshUser} onNavigate={onNavigate} />
        </>
      )}
    </div>
  );
};
