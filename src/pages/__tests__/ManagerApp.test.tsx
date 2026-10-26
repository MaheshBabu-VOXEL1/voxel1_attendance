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
// Unpaid leave overview: empty by default (keeps names out of the other leave tests); the unpaid tests set UNPAID_FULL.
const unpaid = vi.hoisted(() => ({ value: { year: 2026, defaultLimit: null, canEdit: true, people: [] } as any }));
const UNPAID_FULL = { year: 2026, defaultLimit: 9, canEdit: true, people: [
  { employeeId: 'e1', name: 'Divya Kallepalli', used: 10, limit: 9, ownLimit: false },
  { employeeId: 'e2', name: 'Ravi', used: 0, limit: 12, ownLimit: true },
  { employeeId: 'e4', name: 'Abhinay', used: 0, limit: 9, ownLimit: false },
] };
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
  isLeaveApprover: vi.fn(async () => true),
  getUnpaidLeaveOverview: vi.fn(async () => unpaid.value),
  setUnpaidLeaveLimit: vi.fn(async () => {}),
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
  return { ...real, assignedTaskService: { createRecurring: vi.fn(async () => ({ id: "rec1" })), setRecurrence: vi.fn(async () => {}), setStatus: vi.fn(async () => ({})), listModeSwitcherIds: vi.fn(async () => ['e3']), listProjects: vi.fn(async () => [{ id: 'p2', name: 'KAFD', project_number: 2 }]), createProject: vi.fn(async (n: string) => ({ id: 'p3', name: n, project_number: 3 })), assign: vi.fn(async () => ({ id: 'n1' })), createUnassigned: vi.fn(async () => ({ id: 'n2' })), managerUpdate: vi.fn(async () => ({})), markStuck: vi.fn(async () => ({})), setHalfDay: vi.fn(async () => ({})), setPlan: vi.fn(async () => ({})), managerDelete: vi.fn(async () => {}) } };
});

const user = { id: 'mgr', name: 'Test Manager', role: 'MANAGER', email: 'tm@example.com' } as any;

describe('manager app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    unpaid.value = { year: 2026, defaultLimit: null, canEdit: true, people: [] };
    HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open', ''); };
  });

  it('shows the actual assigner and recipient across the shared manager board', async () => {
    render(<ManagerApp user={user} />);
    expect(screen.getByText('Assigned by Maruthi → Divya Kallepalli')).toBeInTheDocument();
    expect(screen.getByText('Assigned by Main Manager → Unassigned')).toBeInTheDocument();
    expect(screen.getByText('Written by Ravi')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Door schedule update' }));
    expect(screen.getAllByText('Assigned by Main Manager → Unassigned')).toHaveLength(2);
    expect(screen.getByText(/Created by another manager\. You can change its priority and due date/)).toBeInTheDocument();
  });

  it('filters to the tasks everyone is working on (Started or In progress)', async () => {
    render(<ManagerApp user={user} />);
    const chip = within(screen.getByRole('group', { name: 'Filter tasks' })).getByRole('button', { name: /In progress/ });
    expect(chip).toHaveTextContent('2');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Review shaft sizes')).toBeInTheDocument();
    expect(screen.getByText('Own note')).toBeInTheDocument();
    expect(screen.queryByText('Door schedule update')).not.toBeInTheDocument();
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
      { id: 'a1', employeeId: 'e1', date: today, checkIn: '10:40', status: 'PRESENT' } as any,
    ]);
    render(<ManagerApp user={user} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Attendance/ }));
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows[0].textContent).toBe('Team memberInOutHours');
    const divya = rows.find(r => r.textContent!.includes('Divya Kallepalli'))!;
    expect(divya.textContent).toContain('Late · working');
    expect(divya.textContent).toContain('10:40');
    expect(rows.find(r => r.textContent!.includes('Ravi'))!.textContent).toContain('Not in yet');
    expect(table.textContent).not.toContain('Test Manager');
    const kpis = document.querySelector('.kpis')!.textContent!;
    expect(kpis).toContain('1/5Present'); expect(kpis).toContain('1Late'); expect(kpis).toContain('4Not in');
    expect(screen.getByText(/Late = checked in after 10:15 am/)).toBeInTheDocument();
    fireEvent.click(divya);
    expect(await screen.findByText(/last 10 working days/)).toBeInTheDocument();
    await waitFor(() => expect(hrService.getAttendance).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'e1' })));
  });

  it('does not double-count hours when a person has two open check-ins today', async () => {
    const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
    if (nowM < 70) return; // too close to midnight to place both check-ins today
    const at = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    vi.mocked(hrService.getHolidays).mockResolvedValueOnce([]);
    vi.mocked(hrService.getAttendance).mockImplementation(async (o: any) => o?.employeeId ? [] : [
      { id: 'a1', employeeId: 'e1', date: today, checkIn: at(nowM - 60), status: 'LATE' } as any,
      { id: 'a2', employeeId: 'e1', date: today, checkIn: at(nowM - 55), status: 'LATE' } as any,
    ]);
    render(<ManagerApp user={user} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Attendance/ }));
    const table = await screen.findByRole('table');
    const divya = within(table).getAllByRole('row').find(r => r.textContent!.includes('Divya Kallepalli'))!;
    expect(divya.textContent).toMatch(/1h 0[01]m/); // not 1h 55m
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
    await waitFor(() => expect(assignedTaskService.setPlan).toHaveBeenCalledWith('n2', { priority: 'MEDIUM', dueDate: today, halfDay: true }));
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

  it('lists people with no open task under No task in the Person view, and Assign task picks them in the add bar', async () => {
    (hrService.getAttendance as any).mockResolvedValue([{ employeeId: 'e4', date: today, checkIn: '09:10' }]);
    render(<ManagerApp user={user} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Person' }));
    const list = await waitFor(() => { const l = document.querySelector('.list.free'); if (!l) throw new Error('no list'); return l as HTMLElement; });
    await waitFor(() => expect(within(list).getByText('Checked in')).toBeInTheDocument());
    const names = [...list.querySelectorAll('.free-n')].map(n => n.textContent);
    expect(names[0]).toBe('Abhinay');
    expect(names).toEqual(expect.arrayContaining(['Srikanth Gunda', 'Test Manager (me)', 'Maruthi']));
    expect(names).not.toContain('Divya Kallepalli'); // has an open task (and is on leave today)
    expect(names).not.toContain('Ravi'); // has an open task
    fireEvent.click(within(list).getByRole('button', { name: 'Assign a task to Abhinay' }));
    expect(document.querySelector('.comp .chipbtn')!.textContent).toContain('Abhinay');
    fireEvent.click(screen.getByRole('tab', { name: 'Date' }));
    expect(document.querySelector('.list.free')).toBeNull();
    (hrService.getAttendance as any).mockResolvedValue([]);
  });

  it('shows done-today / total next to each person in the Person view', async () => {
    const extra = [
      { id: 'd1', employee_id: 'e1', employee_name: 'Divya Kallepalli', assigned_by: 'mgr', manager_name: 'Test Manager', description: 'Finished today', project_name: 'Vyoma', status: 'END', completed_at: new Date().toISOString(), self_created: false, created: '2026-10-08T01:00:00Z' },
      { id: 'd2', employee_id: 'e1', employee_name: 'Divya Kallepalli', assigned_by: 'mgr', manager_name: 'Test Manager', description: 'Finished last year', project_name: 'Vyoma', status: 'END', completed_at: '2025-01-01T10:00:00Z', self_created: false, created: '2025-01-01T01:00:00Z' },
    ] as any[];
    tasks.push(...extra);
    try {
      render(<ManagerApp user={user} />);
      fireEvent.click(screen.getByRole('tab', { name: 'Person' }));
      // Divya: 1 open (Review shaft sizes) + 1 finished today = 1/2; the one finished last year does not count.
      expect(await screen.findByLabelText('1 of 2 done today')).toBeInTheDocument();
      // Ravi: 1 open, none finished today.
      expect(screen.getByLabelText('0 of 1 done today')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('option', { name: /Done/ }));
    await waitFor(() => expect(assignedTaskService.setStatus).toHaveBeenCalledWith('t1', 'END'));
    expect(assignedTaskService.managerUpdate).not.toHaveBeenCalled();
  });

  it('asks how much is done and why before marking a task Stuck', async () => {
    render(<ManagerApp user={user} />);
    fireEvent.click(screen.getByRole('button', { name: 'Status: In progress. Change status' }));
    fireEvent.click(screen.getByRole('option', { name: /Stuck/ }));
    const save = await screen.findByRole('button', { name: 'Mark stuck' });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: '50%' }));
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Why is it stuck?'), { target: { value: ' Waiting for level 3 drawings ' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(assignedTaskService.markStuck).toHaveBeenCalledWith('t1', 50, 'Waiting for level 3 drawings'));
    expect(assignedTaskService.managerUpdate).not.toHaveBeenCalled();
  });

  it('shows the stuck note under a stuck task', async () => {
    const extra = { id: 's1', employee_id: 'e1', employee_name: 'Divya Kallepalli', assigned_by: 'mgr', manager_name: 'Test Manager', description: 'Basement drainage', project_name: 'Vyoma', due_date: today, status: 'STUCK', stuck_progress: 75, stuck_reason: 'Client has not sent levels', stuck_at: new Date().toISOString(), self_created: false, created: '2026-10-08T00:30:00Z' } as any;
    tasks.push(extra);
    try {
      render(<ManagerApp user={user} />);
      const row = screen.getByRole('button', { name: 'Basement drainage' }).closest('.trw')!;
      expect(row.textContent).toContain('Stuck · 75% done');
      expect(row.textContent).toContain('“Client has not sent levels”');
    } finally { tasks.pop(); }
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

  it('lets Maruthi, the only leave approver, decide every leave including his own', async () => {
    vi.mocked(hrService.getLeaves).mockResolvedValue([
      { id: 'l1', employeeId: 'e1', employeeName: 'Divya Kallepalli', lineManagerId: 'kesari', startDate: today, endDate: today, totalDays: 1, type: 'CASUAL_SICK', reason: 'Fever', status: 'PENDING_MANAGER', appliedDate: today },
      { id: 'l2', employeeId: 'e3', employeeName: 'Maruthi', lineManagerId: 'kesari', startDate: today, endDate: today, totalDays: 1, type: 'CASUAL_SICK', reason: 'Trip', status: 'PENDING_MANAGER', appliedDate: today },
    ] as any);
    render(<ManagerApp user={{ id: 'e3', name: 'Maruthi', role: 'MANAGER' } as any} />);
    fireEvent.click(screen.getByRole('button', { name: /Leaves/ }));
    expect(await screen.findByText('Maruthi', { selector: 'b' })).toBeInTheDocument();
    expect(screen.getByText('Divya Kallepalli', { selector: 'b' })).toBeInTheDocument();
    expect(screen.getByText('2 requests waiting for you')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(2);
    fireEvent.click(screen.getByText('Maruthi', { selector: 'b' }).closest('.lv')!.querySelector('.btn.go')!);
    await waitFor(() => expect(hrService.updateLeaveStatus).toHaveBeenCalledWith('l2', 'APPROVED', '', 'MANAGER'));
  });

  it('shows leave requests to other managers without Approve or Reject (only Maruthi decides)', async () => {
    vi.mocked(hrService.isLeaveApprover).mockResolvedValue(false);
    vi.mocked(hrService.getLeaves).mockResolvedValue([
      { id: 'l1', employeeId: 'e1', employeeName: 'Divya Kallepalli', lineManagerId: 'mgr', startDate: today, endDate: today, totalDays: 1, type: 'CASUAL_SICK', reason: 'Fever', status: 'PENDING_MANAGER', appliedDate: today },
    ] as any);
    try {
      render(<ManagerApp user={user} />);
      fireEvent.click(screen.getByRole('button', { name: /Leaves/ }));
      expect(await screen.findByText('Divya Kallepalli', { selector: 'b' })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByText('Only Maruthi can approve')).toBeInTheDocument());
      expect(screen.getByText('1 request waiting for Maruthi')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
      expect(document.querySelector('.nb')).toBeNull();
    } finally { vi.mocked(hrService.isLeaveApprover).mockResolvedValue(true); }
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

  it('lists High priority first within a group and filters by Due today, High priority and Overdue', async () => {
    const yest = ymd(new Date(Date.now() - 864e5));
    const extra = [
      { id: 'p1', employee_id: 'e1', employee_name: 'Divya Kallepalli', assigned_by: 'mgr', manager_name: 'Test Manager', description: 'Low job', project_name: 'Vyoma', due_date: today, priority: 'LOW', status: 'NOT_STARTED', self_created: false, created: '2026-10-08T09:00:00Z' },
      { id: 'p2', employee_id: 'e1', employee_name: 'Divya Kallepalli', assigned_by: 'mgr', manager_name: 'Test Manager', description: 'Urgent job', project_name: 'Vyoma', due_date: today, priority: 'HIGH', status: 'NOT_STARTED', self_created: false, created: '2026-10-08T08:00:00Z' },
      { id: 'p3', employee_id: 'e1', employee_name: 'Divya Kallepalli', assigned_by: 'mgr', manager_name: 'Test Manager', description: 'Late job', project_name: 'Vyoma', due_date: yest, status: 'NOT_STARTED', self_created: false, created: '2026-10-08T07:00:00Z' },
    ] as any[];
    tasks.push(...extra);
    try {
      render(<ManagerApp user={user} />);
      const order = Array.from(document.querySelectorAll('.tt')).map(b => b.textContent);
      expect(order.indexOf('Urgent job')).toBeLessThan(order.indexOf('Review shaft sizes'));
      expect(order.indexOf('Review shaft sizes')).toBeLessThan(order.indexOf('Low job'));
      const bar = screen.getByRole('group', { name: 'Filter tasks' });
      fireEvent.click(within(bar).getByRole('button', { name: /High priority/ }));
      expect(screen.getByText('Urgent job')).toBeInTheDocument();
      expect(screen.queryByText('Low job')).not.toBeInTheDocument();
      fireEvent.click(within(bar).getByRole('button', { name: /Overdue/ }));
      expect(screen.getByText('Late job')).toBeInTheDocument();
      expect(screen.queryByText('Urgent job')).not.toBeInTheDocument();
      fireEvent.click(within(bar).getByRole('button', { name: /Due today/ }));
      expect(screen.getByText('Low job')).toBeInTheDocument();
      expect(screen.queryByText('Late job')).not.toBeInTheDocument();
    } finally { tasks.splice(tasks.length - 3, 3); }
  });

  it('saves a new task with the chosen priority', async () => {
    render(<ManagerApp user={user} />);
    fireEvent.change(screen.getByLabelText('New task'), { target: { value: 'Pump room check' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Priority' })).getByRole('radio', { name: 'High' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(assignedTaskService.setPlan).toHaveBeenCalledWith('n2', { priority: 'HIGH', dueDate: null, halfDay: false }));
  });

  it('lets any manager change priority on a task another manager created', async () => {
    render(<ManagerApp user={user} />);
    const row = screen.getByRole('button', { name: 'Door schedule update' }).closest('.trw') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Priority: Medium. Change priority' }));
    fireEvent.click(screen.getByRole('option', { name: /High/ }));
    await waitFor(() => expect(assignedTaskService.setPlan).toHaveBeenCalledWith('t2', { priority: 'HIGH', dueDate: null, halfDay: false }));
    expect(assignedTaskService.managerUpdate).not.toHaveBeenCalled();
  });

  it('shows unpaid leave used / limit on the Leaves tab and lets the approver change everyone\'s limit', async () => {
    unpaid.value = UNPAID_FULL;
    render(<ManagerApp user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /Leaves/ }));
    await screen.findByRole('heading', { name: 'Unpaid leave 2026' });
    expect(screen.getByText('9 days a year each · counts from 0 every January')).toBeInTheDocument();
    expect(screen.getByText('10 used of 9')).toBeInTheDocument();
    expect(screen.getByText('Over')).toBeInTheDocument();
    expect(screen.getByText('0 used of 12 · own limit')).toBeInTheDocument();
    expect(screen.queryByText(/Abhinay/)).not.toBeInTheDocument();
    const everyone = screen.getByText('Everyone').closest('.rw') as HTMLElement;
    fireEvent.click(within(everyone).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Unpaid days a year'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(hrService.setUnpaidLeaveLimit).toHaveBeenCalledWith(null, 12));
  });

  it('removes a person\'s own unpaid limit so they use everyone\'s again', async () => {
    unpaid.value = UNPAID_FULL;
    render(<ManagerApp user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /Leaves/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit unpaid limit for Ravi' }));
    expect(screen.getByLabelText('Unpaid days a year')).toHaveValue(12);
    fireEvent.click(screen.getByRole('button', { name: "Use everyone's limit" }));
    await waitFor(() => expect(hrService.setUnpaidLeaveLimit).toHaveBeenCalledWith('e2', null));
  });

  it('shows the limits read-only to managers who are not the approver', async () => {
    unpaid.value = { year: 2026, defaultLimit: null, canEdit: false, people: [] };
    render(<ManagerApp user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /Leaves/ }));
    await screen.findByText('Set by Maruthi');
    expect(screen.getByText('No limit · unpaid days are only counted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set a limit for one person' })).not.toBeInTheDocument();
  });
});


describe('recurring tasks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates 20 tasks with their own recurrence calls and resets the composer', async () => {
    render(<ManagerApp user={user} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Project: / }).textContent).not.toBe('Project'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Repeat weekly' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tuesday' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Thursday' }));
    fireEvent.change(screen.getByLabelText('New task'), { target: { value: Array.from({ length: 20 }, (_, i) => `Report ${i + 1}`).join(';') } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(assignedTaskService.createRecurring).toHaveBeenCalledTimes(20));
    expect(new Set(vi.mocked(assignedTaskService.createRecurring).mock.calls.map(call => call[1])).size).toBe(20);
    for (const call of vi.mocked(assignedTaskService.createRecurring).mock.calls) expect(call[4]).toEqual([1, 2, 4]);
    expect(assignedTaskService.createUnassigned).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Repeat weekly' })).not.toBeChecked());
  });

  it('lets a manager give an existing task an independent schedule', async () => {
    render(<ManagerApp user={user} />);
    fireEvent.click(screen.getByRole('button', { name: 'Door schedule update' }));
    const controls = screen.getAllByRole('group', { name: 'Recurring task' });
    fireEvent.click(within(controls[controls.length - 1]).getByRole('checkbox', { name: 'Repeat weekly' }));
    await waitFor(() => expect(assignedTaskService.setRecurrence).toHaveBeenCalledWith('t2', [1]));
    expect(assignedTaskService.managerUpdate).not.toHaveBeenCalled();
  });
});
