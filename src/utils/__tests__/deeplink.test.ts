import { describe, it, expect, afterEach } from 'vitest';
import { getCurrentRoute, buildHash, isAuthCallbackHash, canAccessRoute } from '../deeplink';

const setHash = (hash: string) => { window.location.hash = hash; };

describe('getCurrentRoute', () => {
  afterEach(() => setHash(''));

  it('matches simple pages', () => {
    setHash('#/dashboard');
    expect(getCurrentRoute()).toEqual({ path: 'dashboard', params: null });
    setHash('#/leaves/');
    expect(getCurrentRoute()).toEqual({ path: 'leave', params: null });
  });

  it('extracts params', () => {
    setHash('#/leave/abc123');
    expect(getCurrentRoute()).toEqual({ path: 'leave', params: { openLeaveId: 'abc123' } });
    setHash('#/employee/e1');
    expect(getCurrentRoute()).toEqual({ path: 'employees', params: { selectedEmployeeId: 'e1' } });
  });

  it('round-trips every hash it builds', () => {
    for (const path of ['dashboard', 'calendar', 'reports', 'profile', 'today-task', 'attendance-audit']) {
      setHash(buildHash(path)!);
      expect(getCurrentRoute()?.path).toBe(path);
    }
  });

  it('ignores unknown, empty and logged-out screen hashes', () => {
    for (const hash of ['', '#/', '#/nope', '#/login', '#/signup']) {
      setHash(hash);
      expect(getCurrentRoute()).toBeNull();
    }
  });
});

describe('isAuthCallbackHash', () => {
  it('detects Supabase sign-in and recovery hashes', () => {
    expect(isAuthCallbackHash('#access_token=x&type=recovery')).toBe(true);
    expect(isAuthCallbackHash('#/?token=abc')).toBe(true);
    expect(isAuthCallbackHash('#/dashboard')).toBe(false);
  });
});

describe('canAccessRoute', () => {
  it('limits admin pages to admins', () => {
    expect(canAccessRoute('reports', 'ADMIN')).toBe(true);
    expect(canAccessRoute('reports', 'MANAGER')).toBe(false);
    expect(canAccessRoute('reports', 'EMPLOYEE')).toBe(false);
  });

  it('limits the team directory to admins', () => {
    expect(canAccessRoute('employees', 'ADMIN')).toBe(true);
    expect(canAccessRoute('employees', 'MANAGER')).toBe(false);
    expect(canAccessRoute('employees', 'EMPLOYEE')).toBe(false);
  });

  it('allows everyday pages for everyone', () => {
    for (const role of ['ADMIN', 'MANAGER', 'EMPLOYEE']) {
      expect(canAccessRoute('dashboard', role)).toBe(true);
      expect(canAccessRoute('leave', role)).toBe(true);
    }
  });
});
