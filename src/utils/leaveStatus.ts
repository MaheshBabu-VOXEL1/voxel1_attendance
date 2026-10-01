/**
 * Display label for a leave status. The stored value PENDING_HR is kept for
 * compatibility, but the step is handled by Admin (the org has no HR role),
 * so it is shown as "Pending Admin".
 */
export const leaveStatusLabel = (status: string): string => {
  switch (status) {
    case 'PENDING_HR': return 'PENDING ADMIN';
    case 'PENDING_MANAGER': return 'PENDING MANAGER';
    default: return status.replace(/_/g, ' ');
  }
};

/** How long a decided request stays on the employee dashboard after the decision. */
export const DECISION_VISIBLE_MS = 24 * 60 * 60 * 1000;

const PENDING = ['PENDING_MANAGER', 'PENDING_HR'];
const DECIDED = ['APPROVED', 'REJECTED'];

/**
 * The employee's own requests for the dashboard: every request still waiting
 * for a decision, plus requests approved or rejected in the last 24 hours.
 * After that they are only on the Leave page. Waiting ones first (oldest
 * first), then decisions (newest first).
 */
export function dashboardLeaves<T extends { employeeId: string; status: string; appliedDate?: string; startDate: string; updated?: string }>(
  leaves: T[], employeeId: string, now = Date.now(),
): T[] {
  const mine = leaves.filter(l => l.employeeId === employeeId);
  const decidedAt = (l: T) => (l.updated ? new Date(l.updated).getTime() : NaN);
  const pending = mine
    .filter(l => PENDING.includes(l.status))
    .sort((a, b) => (a.appliedDate || a.startDate).localeCompare(b.appliedDate || b.startDate));
  const recent = mine
    .filter(l => DECIDED.includes(l.status) && now - decidedAt(l) <= DECISION_VISIBLE_MS)
    .sort((a, b) => decidedAt(b) - decidedAt(a));
  return [...pending, ...recent];
}
