import React, { useState } from 'react';
import { Database, Menu, X, LayoutDashboard, Clock, CalendarDays, UserCircle, Sun, Moon, PanelLeftClose, PanelLeftOpen, ListTodo, ClipboardList } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import NotificationBell from '../components/notifications/NotificationBell';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { SubscriptionBanner } from '../components/subscription';
import { initialsAvatar } from '../utils/initialsAvatar';


const SIDEBAR_COLLAPSED_KEY = 'voxel1_sidebar_collapsed';

interface MainLayoutProps {
  children: React.ReactNode;
  currentPath: string;
  onNavigate: (path: string) => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, currentPath, onNavigate }) => {
  const { user, logout } = useAuth();
  const { darkMode, setDarkModePreference } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Desktop: the sidebar can be closed to give the page full width; remembered per browser.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch { return false; }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const handleNavigate = (path: string) => {
    onNavigate(path);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    onNavigate('dashboard'); // Reset path on logout
  };

  if (!user) return null;

  // Phone bottom bar. "Tasks" goes to the page each role actually uses.
  const tasksItem = user.role === 'EMPLOYEE'
    ? { id: 'today-task', label: 'Tasks', Icon: ListTodo, active: ['today-task'] }
    : { id: 'team-tasks', label: 'Tasks', Icon: ClipboardList, active: ['team-tasks'] };
  const bottomNavItems = [
    ...(user.role === 'EMPLOYEE' ? [] : [{ id: 'dashboard', label: 'Home', Icon: LayoutDashboard, active: ['dashboard'] }]),
    ...(tasksItem ? [tasksItem] : []),
    user.role === 'EMPLOYEE'
      ? { id: 'attendance-logs', label: 'Attendance & Leaves', Icon: CalendarDays, active: ['attendance-logs', 'leave'] }
      : { id: 'leave', label: 'Leave', Icon: CalendarDays, active: ['leave'] },
    // The Manager has no own attendance; their history view is the team audit.
    // Employees use the combined Attendance and Leaves page.
    ...(user.role === 'EMPLOYEE' ? [] : [user.role === 'MANAGER'
      ? { id: 'attendance-audit', label: 'History', Icon: Clock, active: ['attendance-audit'] }
      : { id: 'attendance-logs', label: 'History', Icon: Clock, active: ['attendance-logs', 'attendance-audit'] }]),
    { id: 'profile', label: 'Account', Icon: UserCircle, active: ['profile'] },
  ];

  return (
    <div className="flex bg-[#fcfdfe] min-h-screen relative overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-white focus:font-semibold focus:shadow-lg"
      >
        Skip to content
      </a>
      {/* Mobile Overlay */}
      <div 
        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] md:hidden transition-opacity duration-300 ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsMobileMenuOpen(false)}
      />

      {/* Sidebar */}
      <div
        className={`fixed h-full z-[70] transition-transform duration-300 ease-in-out ${isSidebarCollapsed ? 'md:-translate-x-full' : 'md:translate-x-0'} ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
        inert={isSidebarCollapsed && !isMobileMenuOpen ? true : undefined}
      >
        <Sidebar 
          currentPath={currentPath} 
          onNavigate={handleNavigate} 
          onLogout={handleLogout} 
          role={user.role} 
          user={user}
        />
      </div>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col min-h-screen max-w-full overflow-hidden transition-[margin] duration-300 ease-in-out ${isSidebarCollapsed ? 'md:ml-0' : 'md:ml-80'}`}>
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-50 flex items-center justify-between gap-2 px-4 sm:px-6 md:px-10 sticky top-0 z-40">
           <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 -ml-2 text-slate-500 md:hidden hover:bg-slate-50 rounded-xl transition-all flex-shrink-0"
              >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>

              <button
                onClick={toggleSidebar}
                className="hidden md:flex p-2 -ml-2 text-slate-500 hover:text-primary hover:bg-slate-50 rounded-xl transition-all flex-shrink-0"
                title={isSidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
                aria-label={isSidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
                aria-expanded={!isSidebarCollapsed}
              >
                {isSidebarCollapsed ? <PanelLeftOpen size={22} /> : <PanelLeftClose size={22} />}
              </button>

              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                 <img src="/img/voxel1-logo.png" width={182} height={50} className="h-8 w-auto md:hidden flex-shrink-0" alt="VOXEL1" />
                 <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full border bg-slate-50 text-slate-400 border-slate-100">
                   <Database size={12} />
                   <span className="text-[9px] font-semibold uppercase tracking-widest">Cloud Node Alpha</span>
                 </div>
              </div>
           </div>

           <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <button
                onClick={() => setDarkModePreference(darkMode ? 'light' : 'dark')}
                className="p-2.5 rounded-xl text-slate-500 hover:text-primary hover:bg-slate-100 transition-all flex-shrink-0"
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <NotificationBell onNavigate={handleNavigate} />
              <div
                className="cursor-pointer flex-shrink-0"
                onClick={() => handleNavigate('profile')}
              >
                <img
                  src={user.avatar || initialsAvatar(user.name)}
                  className="w-10 h-10 rounded-full bg-slate-50 object-cover ring-2 ring-transparent hover:ring-primary transition-all shadow-sm flex-shrink-0"
                  alt="Profile"
                  width={40}
                  height={40}
                />
              </div>
           </div>
        </header>

        {/* Subscription Banner - visible to all org users */}
        <SubscriptionBanner onExitDemo={handleLogout} />

        {/* Content */}
        <div id="main-content" className="flex-1 p-6 md:p-12 w-full pb-28 md:pb-12 overflow-x-hidden">
          <div className="max-w-4xl mx-auto w-full">
            {children}
          </div>

        </div>

        {/* Bottom Navigation (Mobile) */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-2xl border-t border-slate-100 flex items-stretch px-1 pt-1 z-50 pb-[env(safe-area-inset-bottom)]">
          {bottomNavItems.map(({ id, label, Icon, active }) => {
            const isActive = active.includes(currentPath);
            return (
              <button
                key={id}
                onClick={() => handleNavigate(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex-1 min-h-[56px] flex flex-col items-center justify-center gap-1 rounded-xl transition-all active:bg-slate-100 ${isActive ? 'text-primary' : 'text-slate-400'}`}
              >
                <Icon size={20} className={isActive ? 'scale-110' : ''} />
                <span className="text-[10px] font-semibold uppercase tracking-tighter">{label}</span>
              </button>
            );
          })}
        </nav>
      </main>
    </div>
  );
};

export default MainLayout;
