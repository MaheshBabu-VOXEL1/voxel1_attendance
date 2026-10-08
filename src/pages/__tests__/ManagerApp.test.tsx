import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ManagerApp from '../ManagerApp';
import { assignedTaskService } from '../../services/assignedTask.service';
import { hrService } from '../../services/hrService';
import { calendarService } from '../../services/calendar.service';
import { ymd } from '../../utils/attendanceSheet';

const today = ymd(new Date());
const tasks = [
  { id: 't1', employee_id: 'e1', employee_name: 'Divya Kallepalli', assigned_by: 'mgr', description: 'Review shaft sizes', project_name: 'Vyoma', project_number: 1, due_date: today, status: 'PROGRESS', self_created: false, created: '2026-10-08T05:00:00Z' },
  { id: 't2', employee_id: null, employee_name: null, assigned_by: 'mgr', description: 'Door schedule update', project_name: 'Vyoma', status: 'NOT_STARTED', self_created: false, created: '2026-10-08T04:00:00Z' },
  { id: 't3', employee_id: 'e2', employee_name: 'Ravi', assigned_by: 'mgr', description: 'Own note', project_name: null, status: 'START', self_created: true, created: '2026-10-08T03:00:00Z' },
];
vi.mock('../../hooks/useAssignedTasks', () => ({ useAssignedTasks: () => ({ tasks, loading: false, error: '', refresh: vi.fn(async () => {}) }) }));
vi.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ darkMode: false, setDarkModePreference: vi.fn() }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('../../services/employee.service', () => ({ employeeService: { getEmployees: async () => [
  { id: 'e2', name: 'Ravi', role: 'EMPLOYEE', status: 'ACTIVE' }, { id: 'e1', name: 'Divya Kallepalli', role: 'EMPLOYEE', status: 'ACTIVE' },
  { id: 'mgr', name: 'Test Manager', role: 'MANAGER', status: 'ACTIVE' },
] } }));
vi.mock('../../services/hrService', () => ({ hrService: {
  getLeaves: vi.fn(async () => [
    { id: 'l1', employeeId: 'e1', employeeName: 'Divya Kallepalli', lineManagerId: 'mgr', startDate: today, endDate: today, totalDays: 1, type: 'CASUAL_SICK', reason: 'Fever', status: 'PENDING_MANAGER', appliedDate: today },
  ]),
  getLeaveBalance: vi.fn(async () => ({ employeeId: 'e1', CASUAL_SICK: 5, PAID: 7 })),
  getLeaveTypes: async () => [{ id: 'CASUAL_SICK', name: 'Casual & Sick Leave', color: '', hasBalance: true }, { id: 'PAID', name: 'Paid Leave', color: '', hasBalance: true }],
  getConfig: async () => ({ workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }),
  getHolidays: vi.fn(async () => [{ id: 'h1', date: today, name: 'Company day', isGovernment: false, type: 'FESTIVAL' }]),
  updateLeaveStatus: vi.fn(async () => {}),
  getActiveAttendance: vi.fn(async () => null),
  getAttendance: vi.fn(async () => []),
} }));
vi.mock('../../services/calendar.service', () => ({ calendarService: {
  listEvents: vi.fn(async () => []), addEvent: vi.fn(async () => ({})), deleteEvent: vi.fn(), addHoliday: vi.fn(), deleteHoliday: vi.fn(async () => {}),
} }));
vi.mock('../../services/assignedTask.service', async (orig) => {
  const real = await orig<typeof import('../../services/assignedTask.service')>();
  return { ...real, assignedTaskService: { assign: vi.fn(async () => ({ id: 'n1' })), createUnassigned: vi.fn(async () => ({ id: 'n2' })), managerUpdate: vi.fn(async () => ({})), managerDelete: vi.fn(async () => {}) } };
});

const user = { id: 'mgr', name: 'Test Manager', role: 'MANAGER', email: 'tm@example.com' } as any;

describe('manager app', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the Tasks, Leaves and Attendance tabs, open tasks grouped by date, and the pending-leave badge', async () => {
    render(<ManagerApp user={user} />);
    expect(screen.getByRole('button', { name: /Tasks/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('3 open tasks')).toBeInTheDocument();
    expect(screen.getByText('Review shaft sizes')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No due date' })).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole('navigation')).getByText('1')).toBeInTheDocument());
  });

  it('shows the manager check-in card and opens the attendance flow', async () => {
    const nav = vi.fn();
    render(<ManagerApp user={user} onNavigate={nav} />);
    expect(await screen.findByText('Not checked in')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(nav).toHaveBeenCalledWith('attendance-quick-office');
  });

  it('offers check out once the manager is checked in', async () => {
    vi.mocked(hrService.getActiveAttendance).mockResolvedValueOnce({ checkIn: '09:05', date: today } as any);
    const nav = vi.fn();
    render(<ManagerApp user={user} onNavigate={nav} />);
    expect(await screen.findByText('Checked in')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check out' }));
    expect(nav).toHaveBeenCalledWith('attendance-finish');
  });

  it('shows the attendance table with KPIs, late check-ins and who is not in', async () => {
    vi.mocked(hrService.getHolidays).mockResolvedValueOnce([]);
    vi.mocked(hrService.getAttendance).mockImplementation(async (o: any) => o?.employeeId ? [] : [
      { id: 'a1', employeeId: 'e1', date: today, checkIn: '09:40', status: 'PRESENT' } as any,
    ]);
    render(<ManagerApp user={user} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Attendance/ }));
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows[0].textContent).toBe('Team memberInOutHours');
    const divya = rows.find(r => r.textContent!.includes('Divya Kallepalli'))!;
    expect(divya.textContent).toContain('Late · working');
    expect(divya.textContent).toContain('9:40');
    expect(rows.find(r => r.textContent!.includes('Ravi'))!.textContent).toContain('Not in yet');
    expect(table.textContent).not.toContain('Test Manager');
    const kpis = document.querySelector('.kpis')!.textContent!;
    expect(kpis).toContain('1/2Present'); expect(kpis).toContain('1Late'); expect(kpis).toContain('1Not in');
    expect(screen.getByText(/Late = checked in after 9:15 am/)).toBeInTheDocument();
    fireEvent.click(divya);
    expect(await screen.findByText(/last 10 working days/)).toBeInTheDocument();
    await waitFor(() => expect(hrService.getAttendance).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e1' })));
  });

  it('moves to the previous day from the attendance table', async () => {
    render(<ManagerApp user={user} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Attendance/ }));
    await screen.findByRole('button', { name: 'Previous day' });
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    await waitFor(() => expect(hrService.getAttendance).toHaveBeenCalledWith(expect.objectContaining({ since: expect.not.stringMatching(today) })));
  });

  it('adds a task to the backlog when no person is chosen', async () => {
    render(<ManagerApp user={user} />);
    fireEvent.change(screen.getByLabelText('New task'), { target: { value: 'Pump room check' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(assignedTaskService.createUnassigned).toHaveBeenCalledWith('Pump room check', 'Vyoma', ''));
    expect(assignedTaskService.assign).not.toHaveBeenCalled();
  });

  it('changes status to Stuck through the status menu', async () => {
    render(<ManagerApp user={user} />);
    fireEvent.click(screen.getByRole('button', { name: 'Status: In progress. Change status' }));
    fireEvent.click(screen.getByRole('option', { name: /Stuck/ }));
    await waitFor(() => expect(assignedTaskService.managerUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ status: 'STUCK', employeeId: 'e1', projectName: 'Vyoma' })));
  });

  it('does not let the manager change an employee-written task', () => {
    render(<ManagerApp user={user} />);
    expect(screen.getByRole('button', { name: 'Status: Started. Change status' })).toBeDisabled();
    expect(screen.getByText('Written by employee')).toBeInTheDocument();
  });

  it('approves a leave with balance and clash information', async () => {
    render(<ManagerApp user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /Leaves/ }));
    expect(await screen.findByText('Divya Kallepalli', { selector: 'b' })).toBeInTheDocument();
    expect(screen.getByText(/1 task due while away: Review shaft sizes/)).toBeInTheDocument();
    expect(screen.getByText(/Balance 5 → 4/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(hrService.updateLeaveStatus).toHaveBeenCalledWith('l1', 'APPROVED', '', 'MANAGER'));
  });

  it('shows the calendar inside Attendance and adds an event from the month header', async () => {
    render(<ManagerApp user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /^Attendance/ }));
    fireEvent.click(screen.getByRole('tab', { name: 'Calendar' }));
    expect(await screen.findByText('Company day')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add event or holiday' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Client review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' }));
    await waitFor(() => expect(calendarService.addEvent).toHaveBeenCalledWith('Client review', today));
  });
});
