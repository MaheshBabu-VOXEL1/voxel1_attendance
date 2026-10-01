
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext';
import { ToastProvider } from './context/ToastContext';
import MainLayout from './layouts/MainLayout';
import { PWAUpdateBanner } from './components/PWAUpdateBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { lazyWithReload } from './utils/lazyWithReload';
import { supabase } from './services/supabase';
import { sessionManager } from './services/session/sessionManager';

// Eager: public pages needed for first paint / SEO
import Login from './pages/Login';
import Setup from './pages/Setup';
import { VerifyAccount } from './pages/VerifyAccount';
import { ResetPassword } from './pages/ResetPassword';
import { SuspendedPage } from './components/subscription';

// Removed pages (Contact, Blog, Guides, Privacy Policy, Terms of Service, About, Features, Changelog): send old links straight to the home
// screen instead of a 404. Runs once at load, before the first render reads the
// URL, and again on back/forward. (vercel.json and nginx.conf redirect the same
// paths on the server.)
const isRemovedPath = (pathname: string) =>
  /^\/(contact|blog|how-to-use|privacy|terms|about|features|changelog)(\/.*)?$/.test(pathname);
if (isRemovedPath(window.location.pathname)) {
  window.history.replaceState(null, '', '/' + window.location.search + window.location.hash);
}

// Lazy: authenticated pages loaded on demand after login.
// lazyWithReload auto-recovers from stale chunk hashes after a deploy
// (one-shot reload + SW/cache wipe) so users don't get stuck on a blank
// page when their cached service worker still references deleted assets.
const EmployeeDay = lazyWithReload(() => import('./pages/EmployeeDay'));
const Dashboard = lazyWithReload(() => import('./pages/Dashboard'));
const EmployeeDirectory = lazyWithReload(() => import('./pages/EmployeeDirectory'));
const Attendance = lazyWithReload(() => import('./pages/Attendance'));
const AttendanceLogs = lazyWithReload(() => import('./pages/AttendanceLogs'));
const Leave = lazyWithReload(() => import('./pages/Leave'));
const Calendar = lazyWithReload(() => import('./pages/Calendar'));
const Settings = lazyWithReload(() => import('./pages/Settings'));
const Reports = lazyWithReload(() => import('./pages/Reports'));
const Organization = lazyWithReload(() => import('./pages/Organization'));
const Announcements = lazyWithReload(() => import('./pages/Announcements'));
const AdminNotifications = lazyWithReload(() => import('./pages/AdminNotifications'));
const TodayTask = lazyWithReload(() => import('./pages/TodayTask'));
const AttendanceLeaves = lazyWithReload(() => import('./pages/AttendanceLeaves'));
const TeamTasks = lazyWithReload(() => import('./pages/TeamTasks'));

import {
  getCurrentRoute, navigateToRoute, replaceRoute, buildHash, canAccessRoute, isAuthCallbackHash,
  saveRedirectAfterLogin, takeRedirectAfterLogin, clearRedirectAfterLogin,
} from './utils/deeplink';
import { PushPermissionPrompt } from './components/PushPermissionPrompt';

// There is no Not Found page. A clean path the app has no screen for (for
// example /settings) opens the app instead: as a hash link when there is no
// hash yet (#/settings), which the router then shows or corrects to the right
// screen. Runs once at load and again on back/forward.
const KNOWN_PATHS = ['/'];
const normalizeUnknownPath = () => {
  const path = window.location.pathname;
  const search = window.location.search;
  const hash = window.location.hash;
  if (KNOWN_PATHS.includes(path)) return;

  // Legacy email deep-link paths: /dashboard/<orgId>/<leaveId>/<token>
  // (older leave notifications). Open the leave request they point to.
  const dashMatch = path.match(/^\/dashboard\/\d+\/([a-z0-9]{15,})/i);
  if (dashMatch && dashMatch[1]) {
    window.history.replaceState(null, '', `/${search}#/leave/${dashMatch[1]}`);
    return;
  }

  // /_/ is the PocketBase admin path leaked into verification URLs; its hash is the real target.
  const isPocketBasePath = path === '/_/' || path === '/_';
  const pageHash = !hash && !isPocketBasePath ? '#' + path.replace(/^\/dashboard\/.*$/, '/dashboard').replace(/\/+$/, '') : hash;
  window.history.replaceState(null, '', '/' + search + pageHash);
};
normalizeUnknownPath();

const AppContent: React.FC = () => {
  const { user, isLoading, isConfigured, setConfigured, login, logout, refreshStatus } = useAuth();
  const sessionExpired = refreshStatus.kind === 'forcedLogout' && refreshStatus.reason === 'SESSION_EXPIRED';
  const { subscription, isLoading: isSubscriptionLoading } = useSubscription();
  const [currentPath, setCurrentPath] = useState('dashboard');
  const [navParams, setNavParams] = useState<any>(null);
  /** Hash set by in-app navigation, so the hashchange it causes is skipped. */
  const ownNavigationHashRef = useRef<string | null>(null);
  /** Bumped on each logged-out hashchange so the URL sync re-checks the address. */
  const [hashTick, setHashTick] = useState(0);

  // Visitors see only Log In: employees are added by their organization, so
  // there is no sign-up.
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  // Check URL for verification token on mount
  useEffect(() => {
    let token: string | null = null;

    // 1. Check Search Params (Standard: /?token=...)
    token = new URLSearchParams(window.location.search).get('token');

    // 2. Check Hash Params (Fallback: /#/?token=...)
    if (!token && window.location.hash.includes('?')) {
      const hashQuery = window.location.hash.split('?')[1];
      token = new URLSearchParams(hashQuery).get('token');
    }

    // 3. Check PocketBase default format: /_/#/auth/confirm-verification/{TOKEN}
    if (!token && window.location.hash.includes('/auth/confirm-verification/')) {
      const match = window.location.hash.match(/\/auth\/confirm-verification\/([^/?#]+)/);
      if (match && match[1]) {
        token = match[1];
      }
    }

    if (token) {
      setVerificationToken(token);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
      return;
    }

    // Check for password reset redirect: /?reset=1 (query) or #type=recovery (hash, Supabase default)
    const queryReset = new URLSearchParams(window.location.search).get('reset') === '1';
    const hashRecovery = window.location.hash.includes('type=recovery');
    if (queryReset || hashRecovery) {
      setShowPasswordReset(true);
      // Strip query but KEEP hash — supabase-js needs hash tokens to establish recovery session
      if (queryReset) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Listen for Supabase auth state changes (PASSWORD_RECOVERY, SIGNED_OUT).
  // When Supabase clears the session externally (another tab signs out, token
  // revocation, SDK auto-cleanup after failed refresh), sync sessionManager
  // so the UI immediately reflects the correct auth state.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordReset(true);
      }
      if (event === 'SIGNED_OUT') {
        const snap = sessionManager.getSnapshot();
        if (snap.user) {
          sessionManager.setCurrentUser(null);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Show the page named in the URL, or fix the URL when it names no page this
  // user can open (unknown link, a Log In URL left over after logging in, or a
  // page for another role), so the address bar always matches the screen.
  const applyRouteFromHash = (role: string) => {
    const route = getCurrentRoute();
    if (!route || !canAccessRoute(route.path, role)) {
      const homePath = 'dashboard';
      setCurrentPath(homePath);
      setNavParams(null);
      replaceRoute(homePath, null);
      return;
    }
    // Attendance shortcuts carry their params in the hash itself
    const hash = window.location.hash.replace(/^#/, '').replace(/\/+$/, '');
    let resolvedParams = route.params;
    if (route.path === 'attendance' && !resolvedParams) {
      if (hash === '/attendance/quick-office') resolvedParams = { autoStart: 'OFFICE' };
      else if (hash === '/attendance/finish') resolvedParams = { autoStart: 'FINISH' };
    }
    setCurrentPath(route.path);
    setNavParams(resolvedParams);
  };

  // Deep link: listen for hash changes (back/forward, direct URL navigation, bookmarks)
  useEffect(() => {
    const handleDeepLinkHashChange = () => {
      if (isAuthCallbackHash(window.location.hash)) return;
      // Our own navigation already set the page and its params (some params,
      // like autoOpen, aren't in the URL); don't re-read them from the hash.
      if (window.location.hash === ownNavigationHashRef.current) {
        ownNavigationHashRef.current = null;
        return;
      }
      if (user) {
        applyRouteFromHash(user.role);
        return;
      }
      // Logged out: any address goes to Log In (the effect below fixes the URL).
      setHashTick(t => t + 1);
    };
    window.addEventListener('hashchange', handleDeepLinkHashChange);
    return () => window.removeEventListener('hashchange', handleDeepLinkHashChange);
  }, [user]);

  // Listen for popstate (browser back/forward) for clean URL routes
  useEffect(() => {
    const handlePopState = () => {
      if (isRemovedPath(window.location.pathname)) {
        window.history.replaceState(null, '', '/' + window.location.search + window.location.hash);
      }
      normalizeUnknownPath();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // On auth: open the page from the URL (bookmark, shared link), or the page a
  // logged-out visitor opened before being asked to log in.
  useEffect(() => {
    if (!user || isLoading || showPasswordReset) return;
    if (isAuthCallbackHash(window.location.hash)) return;
    const saved = takeRedirectAfterLogin();
    if (!getCurrentRoute() && saved) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + saved);
    }
    applyRouteFromHash(user.role);
  }, [user, isLoading, showPasswordReset]);

  // Logged out: keep the URL on #/login (the only screen for visitors)
  // instead of the page the user was on before.
  const hadUserRef = useRef(false);
  useEffect(() => {
    if (user) { hadUserRef.current = true; return; }
    if (isLoading || !isConfigured) return;
    if (verificationToken || showPasswordReset) return;
    const hash = window.location.hash;
    if (isAuthCallbackHash(hash)) return;
    const target = '#/login';
    if (hash === target) return;
    if (hadUserRef.current) {
      // Just logged out: the next person to log in starts on their dashboard
      hadUserRef.current = false;
      clearRedirectAfterLogin();
    } else if (getCurrentRoute()) {
      // Opened a page link while logged out: go there after logging in
      saveRedirectAfterLogin(hash);
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search + target);
  }, [user, isLoading, isConfigured, verificationToken, showPasswordReset, hashTick]);

  // Push subscription handled via PushPermissionPrompt (soft-gate, user-initiated)

  const navigateAndRecord = (path: string, params: any) => {
    const hash = buildHash(path, params);
    // Only a hash that actually changes fires hashchange
    ownNavigationHashRef.current = hash !== window.location.hash ? hash : null;
    navigateToRoute(path, params);
  };

  const handleNavigate = (path: string, params?: any) => {
    if (user?.role === 'EMPLOYEE' && !['attendance', 'attendance-quick-office', 'attendance-finish'].includes(path)) path = 'dashboard';
    if (path === 'employees' && user?.role !== 'ADMIN') return;
    if (path === 'attendance-quick-office') {
      setCurrentPath('attendance');
      setNavParams({ autoStart: 'OFFICE' });
      navigateAndRecord('attendance', { autoStart: 'OFFICE' });
    } else if (path === 'attendance-finish') {
      setCurrentPath('attendance');
      setNavParams({ autoStart: 'FINISH' });
      navigateAndRecord('attendance', { autoStart: 'FINISH' });
    } else {
      setCurrentPath(path);
      setNavParams(params || null);
      navigateAndRecord(path, params || null);
    }
  };

  if (!isConfigured) {
    return <Setup onComplete={() => setConfigured(true)} />;
  }


  // Priority 1: Verification Flow (must come BEFORE 404 check)
  if (verificationToken) {
    return <VerifyAccount token={verificationToken} onFinished={() => setVerificationToken(null)} />;
  }

  // Priority 1.5: Password Reset Flow
  if (showPasswordReset) {
    return <ResetPassword onFinished={() => setShowPasswordReset(false)} />;
  }

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-primary" size={48} />
      </div>
    );
  }

  // Priority 2: Log In for visitors (there is no sign-up).
  if (!user) {
    return (
      <Login
        onLoginSuccess={login}
        initError={sessionExpired ? 'You were logged out because you did not open the app for 3 days. Please log in again.' : undefined}
      />
    );
  }

  // Priority 2.5: Check if organization is suspended (show lockout screen)
  // Wait for subscription to load before checking
  if (!isSubscriptionLoading && subscription?.isBlocked) {
    return <SuspendedPage onLogout={logout} />;
  }

  // Priority 3: Authenticated App
  const renderContent = () => {
    if (user.role === 'EMPLOYEE' && currentPath !== 'attendance') return <EmployeeDay user={user} onNavigate={handleNavigate} />;
    switch (currentPath) {
      case 'dashboard': return user.role === 'EMPLOYEE'
        ? <AttendanceLeaves user={user} tab="ATTENDANCE" onNavigate={handleNavigate} />
        : <Dashboard user={user} onNavigate={handleNavigate} />;
      case 'profile': return <Settings user={user} onBack={() => handleNavigate('dashboard')} />;
      case 'employees': return user.role === 'ADMIN'
        ? <EmployeeDirectory user={user} selectedEmployeeId={navParams?.selectedEmployeeId} />
        : <Dashboard user={user} onNavigate={handleNavigate} />;
      case 'attendance':
        return (
          <ErrorBoundary>
            <Attendance
              user={user}
              autoStart={navParams?.autoStart}
              onFinish={() => handleNavigate('dashboard')}
            />
          </ErrorBoundary>
        );
      case 'attendance-logs':
        // Employees share a tabbed attendance and leaves page.
        if (user.role === 'EMPLOYEE') return <AttendanceLeaves user={user} tab="ATTENDANCE" onNavigate={handleNavigate} filterEmployeeId={navParams?.filterEmployeeId} />;
        return <AttendanceLogs user={user} viewMode="MY" filterEmployeeId={navParams?.filterEmployeeId} />;
      case 'attendance-audit': return <AttendanceLogs user={user} viewMode="AUDIT" />;
      case 'leave':
        if (user.role === 'EMPLOYEE') return <AttendanceLeaves user={user} tab="LEAVES" onNavigate={handleNavigate} autoOpen={navParams?.autoOpen} openLeaveId={navParams?.openLeaveId} />;
        return <Leave user={user} autoOpen={navParams?.autoOpen} openLeaveId={navParams?.openLeaveId} />;
      case 'calendar': return <Calendar />;
      case 'announcements': return <Announcements user={user} />;
      case 'today-task':
        return <TodayTask user={user} />;
      case 'team-tasks': return <TeamTasks user={user} initialTab={navParams?.tab} />;
      case 'admin-notifications': return <AdminNotifications user={user} />;
      case 'settings': return <Settings user={user} />;
      case 'reports': return <Reports user={user} />;
      case 'organization': return <Organization initialTab={navParams?.tab} />;
      default: return user.role === 'EMPLOYEE'
        ? <AttendanceLeaves user={user} tab="ATTENDANCE" onNavigate={handleNavigate} />
        : <Dashboard user={user} onNavigate={handleNavigate} />;
    }
  };

  const suspenseFallback = (
    <div className="h-screen w-full flex items-center justify-center bg-slate-50">
      <Loader2 className="animate-spin text-primary" size={48} />
    </div>
  );

  const pushPrompt = (
    <PushPermissionPrompt userId={user.id} organizationId={user.organizationId as string | undefined} />
  );

  if (currentPath === 'attendance' || user.role === 'EMPLOYEE') {
    return (
      <>
        <Suspense fallback={suspenseFallback}>{renderContent()}</Suspense>
        {user.role !== 'EMPLOYEE' && pushPrompt}
      </>
    );
  }

  return (
    <MainLayout currentPath={currentPath} onNavigate={handleNavigate}>
      <Suspense fallback={suspenseFallback}>{renderContent()}</Suspense>
      {pushPrompt}
    </MainLayout>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <ThemeProvider>
          <ToastProvider>
            <AppContent />
            <PWAUpdateBanner />
          </ToastProvider>
        </ThemeProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
};

export default App;
