import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MyLeaveStatusCard } from '../MyLeaveStatusCard';

const leave = (id: string, status: any, extra: Record<string, any> = {}) => ({
  id, employeeId: 'e1', employeeName: 'Mahesh', type: 'Casual Leave',
  startDate: '2026-10-02', endDate: '2026-10-03', totalDays: 2, reason: 'Family function',
  status, appliedDate: '2026-09-25', ...extra,
});

describe('MyLeaveStatusCard', () => {
  it("shows the manager's decision and remark for each request", () => {
    render(
      <MyLeaveStatusCard
        onNavigate={vi.fn()}
        leaves={[
          leave('a', 'APPROVED', { managerRemarks: 'Enjoy the break' }),
          leave('b', 'REJECTED', { managerRemarks: 'Release week, please move it' }),
          leave('c', 'PENDING_MANAGER'),
        ]}
      />,
    );
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
    expect(screen.getByText('REJECTED')).toBeInTheDocument();
    expect(screen.getByText('PENDING MANAGER')).toBeInTheDocument();
    expect(screen.getByText(/Enjoy the break/)).toBeInTheDocument();
    expect(screen.getByText(/Release week, please move it/)).toBeInTheDocument();
  });

  it('opens the specific request when tapped', () => {
    const onNavigate = vi.fn();
    render(<MyLeaveStatusCard onNavigate={onNavigate} leaves={[leave('a', 'APPROVED')]} />);
    fireEvent.click(screen.getByText('Casual Leave'));
    expect(onNavigate).toHaveBeenCalledWith('leave', { openLeaveId: 'a' });
  });

  it('shows an empty message when there are no requests', () => {
    render(<MyLeaveStatusCard onNavigate={vi.fn()} leaves={[]} />);
    expect(screen.getByText('No leave requests waiting. Past requests are on the Leave page.')).toBeInTheDocument();
  });
});
