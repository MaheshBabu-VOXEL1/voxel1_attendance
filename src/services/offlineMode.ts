import { User } from '../types';

/**
 * Offline mode — run the UI with no database while the backend is disconnected.
 *
 * Enabled by VITE_OFFLINE_MODE=true (set in .env.local, which is gitignored).
 * In this mode the Supabase client points at an unreachable host, so no request
 * reaches the real project, and login accepts only the default accounts below
 * (an employee, and a manager who is that employee's line manager).
 * Delete .env.local (or set the flag to false) to reconnect the database.
 */
export const isOfflineMode = import.meta.env.VITE_OFFLINE_MODE === 'true';

const env = (key: string) => (import.meta.env[key] as string | undefined) || '';
const STORAGE_KEY = 'voxel1_offline_user';

interface OfflineAccount { email: string; password: string; user: User }

const offlineAccounts = (): OfflineAccount[] => {
  const employeeEmail = env('VITE_OFFLINE_EMAIL').trim().toLowerCase();
  const managerEmail = env('VITE_OFFLINE_MANAGER_EMAIL').trim().toLowerCase();
  return [
    {
      email: employeeEmail,
      password: env('VITE_OFFLINE_PASSWORD'),
      user: {
        id: 'offline-employee', employeeId: 'EMP-0001', name: 'Mahesh', email: employeeEmail,
        role: 'EMPLOYEE' as User['role'], department: 'General', designation: 'Employee',
        organizationId: 'offline-org', verified: true,
      },
    },
    {
      email: managerEmail,
      password: env('VITE_OFFLINE_MANAGER_PASSWORD'),
      user: {
        id: 'offline-manager', employeeId: 'MGR-0001', name: 'Manager', email: managerEmail,
        role: 'MANAGER' as User['role'], department: 'General', designation: 'Line Manager',
        organizationId: 'offline-org', verified: true,
      },
    },
  ].filter(a => a.email && a.password);
};

/**
 * fetch used by the Supabase client in offline mode: answers instantly with an
 * empty result instead of hitting the network (a real unreachable host makes
 * every query retry and the dashboard hangs for ~15 s).
 */
export const offlineFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...extra },
    });

  if (url.includes('/rest/v1/')) {
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    // Writes can't be stored anywhere while offline — say so plainly.
    if (method !== 'GET' && method !== 'HEAD') {
      return json(503, {
        code: 'OFFLINE',
        message: 'Offline mode: the database is disconnected, so this could not be saved. It will work after you connect Supabase.',
        details: null,
        hint: null,
      });
    }
    // .single()/.maybeSingle() ask for one object; PostgREST answers "no rows" with 406 PGRST116.
    if ((headers.get('Accept') || '').includes('vnd.pgrst.object')) {
      return json(406, { code: 'PGRST116', message: 'Offline mode: no data', details: null, hint: null });
    }
    return json(200, [], { 'Content-Range': '*/0' });
  }
  return json(503, { error: 'offline', message: 'Offline mode: database is disconnected' });
};

export const offlineAuth = {
  login(email: string, password: string): { user: User | null; error?: string } {
    const accounts = offlineAccounts();
    if (accounts.length === 0) {
      return { user: null, error: 'Offline mode: no default account is configured in .env.local.' };
    }
    const account = accounts.find(a => a.email === email.trim().toLowerCase() && a.password === password);
    if (!account) return { user: null, error: 'Invalid login credentials' };
    try { localStorage.setItem(STORAGE_KEY, account.user.id); } catch { /* storage unavailable */ }
    return { user: account.user };
  },

  /** Restore the offline session after a page reload. */
  restore(): User | null {
    try {
      const id = localStorage.getItem(STORAGE_KEY);
      if (!id) return null;
      const accounts = offlineAccounts();
      // '1' was written by the single-account version; treat it as the employee.
      return (accounts.find(a => a.user.id === id) || (id === '1' ? accounts.find(a => a.user.role === 'EMPLOYEE') : undefined))?.user || null;
    } catch { return null; }
  },

  clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  },
};
