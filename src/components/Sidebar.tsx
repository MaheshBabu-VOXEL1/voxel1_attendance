
import React from 'react';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  CalendarRange,
  BarChart3,
  Settings,
  LogOut,
  Network,
  UserCircle,
  ChevronRight,
  List,
  History,
  Megaphone,
  Bell,
  ListTodo,
  ClipboardList,
} from 'lucide-react';
import { accountTypeLabel } from '../utils/accountTypeLabel';
import { initialsAvatar } from '../utils/initialsAvatar';

interface SidebarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  role: string;
  user?: any;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPath, onNavigate, onLogout, role, user }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER'] },
    { id: 'profile', label: 'My Profile', icon: UserCircle, roles: ['ADMIN'] },
    { id: 'attendance-logs', label: 'My Attendance', icon: History, roles: ['ADMIN'] },
    { id: 'attendance-audit', label: 'Attendance Audit', icon: List, roles: ['ADMIN', 'MANAGER'] },
    { id: 'leave', label: 'Leave', icon: CalendarDays, roles: ['ADMIN', 'MANAGER'] },
    { id: 'calendar', label: 'Calendar', icon: CalendarRange, roles: ['ADMIN', 'MANAGER'] },
    { id: 'announcements', label: 'Announcements', icon: Megaphone, roles: ['ADMIN'] },
    { id: 'attendance-logs', label: 'Attendance and Leaves', icon: CalendarDays, roles: ['EMPLOYEE'], alsoActive: ['leave'] },
    { id: 'today-task', label: 'Tasks', icon: ListTodo, roles: ['EMPLOYEE'] },
    { id: 'team-tasks', label: 'Team Tasks', icon: ClipboardList, roles: ['ADMIN', 'MANAGER'] },
    { id: 'admin-notifications', label: 'Notifications', icon: Bell, roles: ['ADMIN'] },
    { id: 'employees', label: 'Team Directory', icon: Users, roles: ['ADMIN'] },
    { id: 'organization', label: 'Organization', icon: Network, roles: ['ADMIN'] },
    { id: 'reports', label: 'Reports', icon: BarChart3, roles: ['ADMIN'] },
    { id: 'settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
  ];

  const filteredItems = menuItems.filter(item => item.roles.includes(role));
  const isActive = (item: { id: string; alsoActive?: string[] }) =>
    currentPath === item.id || !!item.alsoActive?.includes(currentPath);

  return (
    <aside className="w-80 bg-white h-screen flex flex-col border-r border-slate-100 shadow-sm relative z-50">
      {/* Profile Header */}
      <div className="p-10 pb-8 flex flex-col items-center text-center">
        <div className="relative mb-4">
          <img
            src={user?.avatar || initialsAvatar(user?.name || 'User')}
            className="w-24 h-24 rounded-full border-4 border-white shadow-xl bg-slate-50 object-cover"
            alt="Profile"
          />
          <div className="absolute bottom-1 right-1 w-5 h-5 bg-primary border-4 border-white rounded-full"></div>
        </div>
        <h2 className="text-xl font-semibold text-slate-900 leading-tight">{user?.name || 'User Name'}</h2>
        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-tight">{accountTypeLabel(role)}</p>
        <div className="w-full h-px bg-slate-50 mt-8"></div>
      </div>

      {/* Navigation + Sign Out (all scrollable) */}
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto no-scrollbar">
        {filteredItems.map((item) => (
          <div key={item.id} className="space-y-1">
            <button
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl transition-all duration-300 relative group ${
                isActive(item)
                  ? 'bg-primary-light/50 text-primary'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-4">
                {isActive(item) && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-primary rounded-r-full"></div>
                )}
                <item.icon size={22} className={isActive(item) ? 'text-primary' : 'text-slate-400'} />
                <span className="font-bold text-sm tracking-tight">{item.label}</span>
              </div>
              <div className="flex items-center gap-1">
                <ChevronRight size={16} className={`transition-all duration-300 ${isActive(item) ? 'text-primary opacity-100 translate-x-0' : 'text-slate-200 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0'}`} />
              </div>
            </button>
          </div>
        ))}

        {/* Sign Out */}
        <div className="pt-4 pb-2 space-y-4">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 hover:bg-rose-100 active:scale-[0.98] transition-all dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/20"
          >
            <LogOut size={17} />
            <span className="font-semibold text-xs uppercase tracking-wide">Sign Out</span>
          </button>

          <div className="flex flex-col items-center gap-2">
            <img src="/img/voxel1-logo.png" alt="VOXEL1" width={182} height={50} className="h-10 w-auto" />
            <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-[0.3em]">v2.9.0</p>
          </div>
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;
