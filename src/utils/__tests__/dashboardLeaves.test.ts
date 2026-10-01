import { describe, it, expect } from 'vitest';
import { dashboardLeaves, DECISION_VISIBLE_MS } from '../leaveStatus';

const NOW = new Date('2026-09-26T12:00:00Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString();

const leave = (id: string, status: string, extra: Record<string, any> = {}) => ({
  id, employeeId: 'e1', status, startDate: '2026-10-01', appliedDate: '2026-09-20', ...extra,
});

describe('dashboardLeaves (employee dashboard)', () => {
  it('always shows requests still waiting for the manager', () => {
    const out = dashboardLeaves([leave('a', 'PENDING_MANAGER', { updated: hoursAgo(500) })], 'e1', NOW);
    expect(out.map(l => l.id)).toEqual(['a']);
  });

  it('shows an approved or rejected request for 24 hours after the decision, then drops it', () => {
    const out = dashboardLeaves([
      leave('approved-1h', 'APPROVED', { updated: hoursAgo(1) }),
      leave('rejected-23h', 'REJECTED', { updated: hoursAgo(23) }),
      leave('approved-25h', 'APPROVED', { updated: hoursAgo(25) }),
    ], 'e1', NOW);
    expect(out.map(l => l.id)).toEqual(['approved-1h', 'rejected-23h']);
  });

  it('keeps a decision exactly at the 24-hour mark', () => {
    const at = new Date(NOW - DECISION_VISIBLE_MS).toISOString();
    expect(dashboardLeaves([leave('a', 'APPROVED', { updated: at })], 'e1', NOW)).toHaveLength(1);
  });

  it('lists waiting requests first, then the newest decisions', () => {
    const out = dashboardLeaves([
      leave('decided-old', 'REJECTED', { updated: hoursAgo(10) }),
      leave('pending', 'PENDING_MANAGER'),
      leave('decided-new', 'APPROVED', { updated: hoursAgo(2) }),
    ], 'e1', NOW);
    expect(out.map(l => l.id)).toEqual(['pending', 'decided-new', 'decided-old']);
  });

  it("ignores other people's requests and cancelled ones", () => {
    const out = dashboardLeaves([
      leave('other', 'PENDING_MANAGER', { employeeId: 'e2' }),
      leave('cancelled', 'CANCELLED', { updated: hoursAgo(1) }),
    ], 'e1', NOW);
    expect(out).toEqual([]);
  });
});
