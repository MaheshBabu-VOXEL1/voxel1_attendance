import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonthEndReminder } from './MonthEndReminder';
vi.mock('../../services/monthlyReport.service', () => ({ downloadMonthlyReport: vi.fn() }));
describe('manager month-end reminder', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake:['Date'] }); });
  afterEach(() => { vi.useRealTimers(); });
  it('shows the download reminder during the last five India days, with no deletion warning', () => {
    vi.setSystemTime(new Date('2026-10-27T04:00:00Z'));
    render(<MonthEndReminder userId="manager" />);
    expect(screen.getByRole('status')).toHaveTextContent('October 2026 is ending');
    expect(screen.getByRole('button', {name:'Download monthly Excel'})).toBeInTheDocument();
    expect(screen.getByRole('status')).not.toHaveTextContent(/delet/i);
  });
  it('does not show the reminder in the middle of the month', () => {
    vi.setSystemTime(new Date('2026-10-08T04:00:00Z'));
    render(<MonthEndReminder userId="manager" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
