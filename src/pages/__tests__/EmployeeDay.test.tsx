
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmployeeDay from '../EmployeeDay';
const mocks = vi.hoisted(() => ({ status: vi.fn(), leave: vi.fn(), refresh: vi.fn() }));
vi.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ darkMode: false }) }));
vi.mock('../../context/SubscriptionContext', () => ({ useSubscription: () => ({ canPerformAction: () => true }) }));
vi.mock('../../services/assignedTask.service', () => ({ assignedTaskService: { setStatus: mocks.status } }));
vi.mock('../../services/employeeService', () => ({ employeeService: { applyForLeave: mocks.leave } }));
vi.mock('../../hooks/useAssignedTasks', () => ({ useAssignedTasks: () => ({ loading: false, error: '', refresh: mocks.refresh, tasks: [{id:'task1',description:'Review model',project_name:'Vyoma',created:'2026-10-01T09:00:00Z',status:'START',completed_at:null}, {id:'task2',description:'Old drawing',status:'END',completed_at:'2020-01-01T10:00:00Z'}] }) }));
vi.mock('../../services/hrService', () => ({ hrService: {
  getLeaveBalance: async () => ({CASUAL_SICK:12,PAID:7}), getLeaves: async () => [],
  getLeaveTypes: async () => [{id:'CASUAL_SICK',name:'Casual & Sick Leave',color:'',hasBalance:true},{id:'PAID',name:'Paid Leave',color:'',hasBalance:true},{id:'UNPAID',name:'Unpaid Leave',color:'',hasBalance:false}],
  getActiveAttendance: async () => ({checkIn:'09:00'}), getAttendance: async () => [],
  getConfig: async () => ({workingDays:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']}),
  resolveShiftForEmployee: async () => null, getHolidays: async () => [],
} }));
describe('employee reference screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open',''); };
    HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
  });
  it('shows only reference sections and routes checkout through attendance validation', async () => {
    const navigate=vi.fn(); render(<EmployeeDay user={{id:'me'}} onNavigate={navigate}/>);
    await screen.findByText('Checked in');
    fireEvent.click(screen.getByText('Check out')); expect(navigate).toHaveBeenCalledWith('attendance-finish');
    expect(screen.getByText('Leave balance')).toBeTruthy(); expect(screen.getByText('My Tasks')).toBeTruthy();
    expect(screen.queryByText('Old drawing')).toBeNull();
    fireEvent.click(screen.getByText('Show more (1 finished earlier)')); expect(screen.getByText('Old drawing')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
  it('shows the organization leave types and balances, not a fixed Annual/Casual/Sick list', async () => {
    render(<EmployeeDay user={{id:'me'}} onNavigate={vi.fn()}/>);
    await screen.findByText('Checked in');
    const bal = screen.getByText('Leave balance').closest('section')!;
    await waitFor(() => expect(bal.textContent).toContain('Casual & Sick'));
    expect(bal.textContent).toContain('12'); expect(bal.textContent).toContain('Paid'); expect(bal.textContent).toContain('7');
    expect(bal.textContent).not.toContain('Annual'); expect(bal.textContent).not.toContain('Unpaid');
  });
  it('shows project names and searches by project or task', async () => {
    render(<EmployeeDay user={{id:'me'}} onNavigate={vi.fn()}/>);
    await screen.findByText('Checked in');
    expect(screen.getByText('Project: Vyoma')).toBeInTheDocument();
    expect(screen.getByText('1 Oct 2026')).toHaveAttribute('datetime', '2026-10-01T09:00:00Z');
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, {target:{value:' VYOMA '}});
    expect(screen.getByText('Review model')).toBeInTheDocument();
    expect(screen.queryByText('Old drawing')).not.toBeInTheDocument();
    fireEvent.change(search, {target:{value:'drawing'}});
    expect(screen.getByText('Old drawing')).toBeInTheDocument();
    expect(screen.getByText('Project: No project')).toBeInTheDocument();
    expect(screen.queryByText('Review model')).not.toBeInTheDocument();
  });
  it('persists pause and surfaces failures without claiming success', async () => {
    mocks.status.mockRejectedValueOnce(new Error('Connection failed'));
    render(<EmployeeDay user={{id:'me'}} onNavigate={vi.fn()}/>);
    fireEvent.click(screen.getByText('Pause'));
    await waitFor(() => expect(mocks.status).toHaveBeenCalledWith('task1','NOT_STARTED'));
    await screen.findByText('Connection failed'); expect(screen.queryByText('Paused')).toBeNull();
  });
  it('submits half-day leave with the signed-in employee', async () => {
    render(<EmployeeDay user={{id:'me'}} onNavigate={vi.fn()}/>);
    await screen.findByText('Checked in'); fireEvent.click(screen.getByText('Apply leave'));
    fireEvent.click(screen.getByText('Today')); fireEvent.click(screen.getByRole('switch',{name:'Half day'}));
    const note = screen.getByRole('textbox', {name:'Note for your manager (required)'});
    const send = screen.getByRole('button', {name:'Send request'});
    expect(note).toBeRequired();
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(mocks.leave).not.toHaveBeenCalled();
    fireEvent.change(note, {target:{value:'   '}});
    expect(send).toBeDisabled();
    fireEvent.click(send);
    expect(mocks.leave).not.toHaveBeenCalled();
    fireEvent.change(note, {target:{value:' Family function '}});
    expect(send).toBeEnabled();
    fireEvent.click(screen.getByText('Send request'));
    await waitFor(() => expect(mocks.leave).toHaveBeenCalledWith(expect.objectContaining({type:'CASUAL_SICK',totalDays:0.5,reason:'Family function'}),{id:'me'}));
    await screen.findByText('Casual & Sick leave request sent');
  });
});
