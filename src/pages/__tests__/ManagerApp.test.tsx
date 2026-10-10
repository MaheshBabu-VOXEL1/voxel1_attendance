import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import ManagerApp from '../ManagerApp';
vi.mock('../../services/supabase', async (original) => { const actual = await original<typeof import('../../services/supabase')>(); return { ...actual, supabase: { ...actual.supabase, rpc: vi.fn(async () => ({ data: false, error: null })) } }; });
import { assignedTaskService } from '../../services/assignedTask.service';
import { hrService } from '../../services/hrService';
import { calendarService } from '../../services/calendar.service';
import { ymd } from '../../utils/attendanceSheet';

const today = ymd(new Date());
const tasks = [
  { id: 't1', employee_id: 'e1', employee_name: 'Divya Kallepalli', assigned_by: 'mgr', manager_name: 'Maruthi', description: 'Review shaft sizes', project_name: 'Vyoma', project_number: 1, due_date: today, status: 'PROGRESS', self_created: false, created: '2026-10-08T05:00:00Z' },
  { id: 't2', employee_id: null, employee_name: null, assigned_by: 'other-manager', manager_name: 'Main Manager', description: 'Door schedule update', project_name: 'Vyoma', status: 'NOT_STARTED', self_created: false, created: '2026-10-08T04:00:00Z' },
  { id: 't3', employee_id: 'e2', employee_name: 'Ravi', assigned_by: 'mgr', description: 'Own note', project_name: null, status: 'START', self_created: true, created: '2026-10-08T03:00:00Z' },
];
vi.mock('../../hooks/useAssignedTasks', () => ({ useAssignedTasks: () => ({ tasks, loading: false, error: '', refresh: vi.fn(async () => {}) }) }));
vi.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ darkMode: false, setDarkModePreference: vi.fn() }) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock('../../services/employee.service', () => ({ employeeService: { getEmployees: async () => [
  { id: 'e2', name: 'Ravi', role: 'EMPLOYEE', status: 'ACTIVE', department: 'ARC' }, { id: 'e1', name: 'Divya Kallepalli', role: 'EMPLOYEE', status: 'ACTIVE', department: 'MEP' },
  { id: 'e4', name: 'Abhinay', role: 'EMPLOYEE', status: 'ACTIVE', department: 'IT' },
  { id: 'e5', name: 'Srikanth Gunda', role: 'EMPLOYEE', status: 'ACTIVE', department: 'MEP', dotColour: 'grey' },
  { id: 'mgr', name: 'Test Manager', role: 'MANAGER', status: 'ACTIVE' },
  { id: 'e3', name: 'Maruthi', role: 'MANAGER', status: 'ACTIVE' },
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
  return { ...real, assignedTaskService: { setStatus: vi.fn(async () => ({})), listModeSwitcherIds: vi.fn(async () => ['e3']), listProjects: vi.fn(async () => [{ id: 'p2', name: 'KAFD', project_number: 2 }]), createProject: vi.fn(async (n: string) => ({ id: 'p3', name: n, project_number: 3 })), assign: vi.fn(async () => ({ id: 'n1' })), createUnassigned: vi.fn(async () => ({ id: 'n2' })), managerUpdate: vi.fn(async () => ({})), setHalfDay: vi.fn(async () => ({})), managerDelete: vi.fn(async () => {}) } };
});

const user = { id: 'mgr', name: 'Test Manager', role: 'MANAGER', email: 'tm@example.com' } as any;

describe('manager app', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the actual assigner and recipient across the shared manager board', async () => {
    render(<ManagerApp user={user} />);
    expect(screen.getByText('Assigned by Maruthi → Divya Kallepalli')).toBeInTheDocument();
    expect(screen.getByText('Assigned by Main Manager → Unassigned')).toBeInTheDocument();
    expect(screen.getByText('Written by Ravi')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Door schedule update' }));
    expect(screen.getAllByText('Assigned by Main Manager → Unassigned')).toHaveLength(2);
    expect(screen.getByText('Created by another manager. Only they can change it.')).toBeInTheDocument();
  });

  it('finds shared tasks by the assigner name', async () => {
    render(<ManagerApp user={user} />);
    fireEvent.click(screen.getByRole('button', { name: 'Search tasks' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tasks' }), { target: { value: 'Maruthi' } });
    expect(screen.getByText('Review shaft sizes')).toBeInTheDocument();
    expect(screen.queryByText('Door schedule update')).not.toBeInTheDocument();
  });

  it('shows the Tasks, Leaves and Attendance tabs, open tasks grouped by date, and the pending-leave badge', async () => {
    render(<ManagerApp user={user} />);
    expect(screen.getByRole('button', { name: /Tasks/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('3 open tasks')).toBeInTheDocument();
    expect(screen.getByText('Review shaft sizes')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No due date' })).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole('navigation')).getByText('1')).toBeInTheDocument());
  });

  it('does not offer check in to a manager', async () => {
    render(<ManagerApp user={user} onNavigate={vi.fn()} />);
    await waitFor(() => expect(hrService.getActiveAttendance).toHaveBeenCalled());
    expect(screen.queryByText('Not checked in')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check in' })).not.toBeInTheDocument();
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
    expect(kpis).toContain('1/5Present'); expect(kpis).toContain('1Late'); expect(kpis).toContain('4Not in');
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

  it('offers Half Day, Today and Tomorrow (no Day after); Half Day saves a task due today marked half day', async () => {
    render(<ManagerApp user={user} />);
    const seg = screen.getAllByRole('group', { name: 'Due date' })[0];
    expect(within(seg).getAllByRole('button').map(b => b.textContent)).toEqual(['Half Day', 'Today', 'Tomorrow']);
    fireEvent.change(screen.getByLabelText('New task'), { target: { value: 'Pump room check' } });
    fireEvent.click(within(seg).getByRole('button', { name: 'Half Day' }));
    expect(within(seg).getByRole('button', { name: 'Half Day' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(seg).getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(assignedTaskService.setHalfDay).toHaveBeenCalledWith('n2', true));
    expect(assignedTaskService.createUnassigned).toHaveBeenCalledWith('Pump room check', 'Vyoma', today);
  });

  it('moves a half-day task to Overdue 4 h 30 min after the employee started it', async () => {
    const extra = [
  { id: 't4', employee_id: 'e1', employee_name: 'Divya Kallepalli', assigned_by: 'mgr', manager_name: 'Test Manager', description: 'Half day late', project_name: 'Vyoma', due_date: today, half_day: true, started_at: new Date(Date.now() - 5 * 3600e3).toISOString(), status: 'START', self_created: false, created: '2026-10-08T02:00:00Z' },
  { id: 't5', employee_id: 'e1', employee_name: 'Divya Kallepalli', assigned_by: 'mgr', manager_name: 'Test Manager', description: 'Half day running', project_name: 'Vyoma', due_date: today, half_day: true, started_at: new Date(Date.now() - 3600e3).toISOString(), status: 'START', self_created: false, created: '2026-10-08T01:00:00Z' },
    ] as any[];
    tasks.push(...extra);
    try {
    render(<ManagerApp user={user} />);
    const late = screen.getByRole('button', { name: 'Half day late' }).closest('.trw')!;
    expect(late.textContent).toMatch(/Half day · overdue since /);
    expect(screen.getByRole('button', { name: 'Half day running' }).closest('.trw')!.textContent).toMatch(/Half day · finish by /);
    } finally { tasks.splice(tasks.length - 2, 2); }
  });

  it('lists everyone as assignees, including managers and the signed-in manager as (me)', async () => {
    render(<ManagerApp user={user} />);
    await waitFor(() => expect(assignedTaskService.listModeSwitcherIds).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign' })[0]);
    expect(await screen.findByRole('option', { name: /Maruthi/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Ravi/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Test Manager \(me\)/ })).toBeInTheDocument();
  });

  it('colours people ARC blue and MEP green, everyone else grey, unless a colour is chosen', async () => {
    render(<ManagerApp user={user} />);
    await waitFor(() => expect(assignedTaskService.listModeSwitcherIds).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.click(screen.getAllByRole('button', { name: 'Assign' })[0]);
    const dotFor = async (name: RegExp) => (await screen.findByRole('option', { name })).querySelector('.pdot')!.className;
    expect(await dotFor(/Ravi/)).toContain('arc');
    expect(await dotFor(/Divya/)).toContain('mep');
    expect(await dotFor(/Abhinay/)).toContain('grey');
    expect(await dotFor(/Srikanth/)).toContain('grey');
    expect(await dotFor(/Maruthi/)).toContain('grey');
  });

  it('opens the calendar on the first tap of the calendar button', async () => {
    const showPicker = vi.fn();
    (HTMLInputElement.prototype as any).showPicker = showPicker;
    try {
      render(<ManagerApp user={user} />);
      fireEvent.click(screen.getAllByLabelText('Pick a due date')[0]);
      expect(showPicker).toHaveBeenCalledTimes(1);
    } finally { delete (HTMLInputElement.prototype as any).showPicker; }
  });

  it('keeps the New project box open when the phone keyboard opens (page resize and scroll)', async () => {
    render(<ManagerApp user={user} />);
    await waitFor(() => expect(assignedTaskService.listProjects).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /^Project:/ }));
    fireEvent.click(await screen.findByRole('option', { name: /New project/ }));
    const name = await screen.findByLabelText('Project name');
    expect(name).toHaveFocus();
    act(() => { window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('scroll')); });
    expect(screen.getByLabelText('Project name')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Hamad Port' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(assignedTaskService.createProject).toHaveBeenCalledWith('Hamad Port'));
  });

  it('keeps a pick list open while the page only scrolls a little or the address bar resizes it', async () => {
    render(<ManagerApp user={user} />);
    await waitFor(() => expect(assignedTaskService.listProjects).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /^Project:/ }));
    expect(await screen.findByRole('option', { name: /KAFD/ })).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('resize')); });
    expect(screen.getByRole('option', { name: /KAFD/ })).toBeInTheDocument();
  });

  it('closes a pick list when its button scrolls out of view or the phone is rotated', async () => {
    render(<ManagerApp user={user} />);
    await waitFor(() => expect(assignedTaskService.listProjects).toHaveBeenCalled());
    await act(async () => {});
    const btn = screen.getByRole('button', { name: /^Project:/ });
    fireEvent.click(btn);
    expect(await screen.findByRole('option', { name: /KAFD/ })).toBeInTheDocument();
    const rect = vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({ top: -200, bottom: -150, left: 0, right: 100, width: 100, height: 50, x: 0, y: -200, toJSON: () => ({}) } as DOMRect);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(screen.queryByRole('option', { name: /KAFD/ })).not.toBeInTheDocument();
    rect.mockRestore();
    fireEvent.click(btn);
    expect(await screen.findByRole('option', { name: /KAFD/ })).toBeInTheDocument();
    const w = window.innerWidth;
    act(() => { (window as any).innerWidth = w + 200; window.dispatchEvent(new Event('resize')); });
    expect(screen.queryByRole('option', { name: /KAFD/ })).not.toBeInTheDocument();
    (window as any).innerWidth = w;
  });

  it('picks a saved project from the dropdown and creates a new one with + New project', async () => {
    render(<ManagerApp user={user} />);
    await waitFor(() => expect(assignedTaskService.listProjects).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: /^Project:/ }));
    expect(await screen.findByRole('option', { name: /KAFD/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Vyoma/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /New project/ }));
    fireEvent.change(await screen.findByLabelText('Project name'), { target: { value: 'Hamad Port' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(assignedTaskService.createProject).toHaveBeenCalledWith('Hamad Port'));
    expect(await screen.findByRole('button', { name: 'Project: Hamad Port' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('New task'), { target: { value: 'Pump room check' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(assignedTaskService.createUnassigned).toHaveBeenCalledWith('Pump room check', 'Hamad Port', ''));
  });

  it('lets a manager update the status of a task someone else assigned to them', async () => {
    render(<ManagerApp user={{ id: 'e1', name: 'Divya Kallepalli', role: 'MANAGER' } as any} />);
    fireEvent.click(screen.getByRole('button', { name: 'Status: In progress. Change status' }));
    fireEvent.click(screen.getByRole('option', { name: /Stuck/ }));
    await waitFor(() => expect(assignedTaskService.setStatus).toHaveBeenCalledWith('t1', 'STUCK'));
    expect(assignedTaskService.managerUpdate).not.toHaveBeenCalled();
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

  it('lets an account-switch member in Manager mode decide other people\'s leave but not their own', async () => {
    vi.mocked(hrService.getLeaves).mockResolvedValue([
      { id: 'l1', employeeId: 'e1', employeeName: 'Divya Kallepalli', lineManagerId: 'mgr', startDate: today, endDate: today, totalDays: 1, type: 'CASUAL_SICK', reason: 'Fever', status: 'PENDING_MANAGER', appliedDate: today },
      { id: 'l2', employeeId: 'e3', employeeName: 'Maruthi', lineManagerId: 'mgr', startDate: today, endDate: today, totalDays: 1, type: 'CASUAL_SICK', reason: 'Trip', status: 'PENDING_MANAGER', appliedDate: today },
    ] as any);
    render(<ManagerApp user={{ id: 'e3', name: 'Maruthi', role: 'MANAGER' } as any} />);
    fireEvent.click(screen.getByRole('button', { name: /Leaves/ }));
    expect(await screen.findByText('Divya Kallepalli', { selector: 'b' })).toBeInTheDocument();
    expect(screen.queryByText('Maruthi', { selector: 'b' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(hrService.updateLeaveStatus).toHaveBeenCalledWith('l1', 'APPROVED', '', 'MANAGER'));
  });

  it('shows the manager their own leave when they are their own line manager (Kesari)', async () => {
    vi.mocked(hrService.getLeaves).mockResolvedValue([
      { id: 'l9', employeeId: 'mgr', employeeName: 'Test Manager', lineManagerId: 'mgr', startDate: today, endDate: today, totalDays: 1, type: 'CASUAL_SICK', reason: 'Personal', status: 'PENDING_MANAGER', appliedDate: today },
    ] as any);
    render(<ManagerApp user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /Leaves/ }));
    expect(await screen.findByText('Test Manager', { selector: 'b' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(hrService.updateLeaveStatus).toHaveBeenCalledWith('l9', 'APPROVED', '', 'MANAGER'));
  });

  it('does not show other managers\' leave queues to a manager who is not a switch member', async () => {
    vi.mocked(hrService.getLeaves).mockResolvedValue([
      { id: 'l1', employeeId: 'e1', employeeName: 'Divya Kallepalli', lineManagerId: 'someone-else', startDate: today, endDate: today, totalDays: 1, type: 'CASUAL_SICK', reason: 'Fever', status: 'PENDING_MANAGER', appliedDate: today },
    ] as any);
    render(<ManagerApp user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /Leaves/ }));
    expect(await screen.findByText('All caught up')).toBeInTheDocument();
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
