
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmployeeDay from '../EmployeeDay';
const mocks = vi.hoisted(() => ({ status: vi.fn(), leave: vi.fn(), refresh: vi.fn() }));
vi.mock('../../context/ThemeContext', () => ({ useTheme: () => ({ darkMode: false }) }));
vi.mock('../../context/SubscriptionContext', () => ({ useSubscription: () => ({ canPerformAction: () => true }) }));
vi.mock('../../services/assignedTask.service', () => ({ assignedTaskService: { setStatus: mocks.status } }));
vi.mock('../../services/employeeService', () => ({ employeeService: { applyForLeave: mocks.leave } }));
vi.mock('../../hooks/useAssignedTasks', () => ({ useAssignedTasks: () => ({ loading: false, error: '', refresh: mocks.refresh, tasks: [{id:'task1',description:'Review model',status:'START',completed_at:null}, {id:'task2',description:'Old drawing',status:'END',completed_at:'2020-01-01T10:00:00Z'}] }) }));
vi.mock('../../services/hrService', () => ({ hrService: {
  getLeaveBalance: async () => ({ANNUAL:14,CASUAL:10,SICK:14}), getLeaves: async () => [],
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
    fireEvent.click(screen.getByText('Send request'));
    await waitFor(() => expect(mocks.leave).toHaveBeenCalledWith(expect.objectContaining({type:'ANNUAL',totalDays:0.5}),{id:'me'}));
    await screen.findByText('Annual leave request sent');
  });
});
