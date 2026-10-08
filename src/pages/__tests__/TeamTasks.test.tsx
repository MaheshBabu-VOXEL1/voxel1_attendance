import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TeamTasks from '../TeamTasks';
import { employeeService } from '../../services/employee.service';
import { assignedTaskService } from '../../services/assignedTask.service';
vi.mock('../../services/employee.service', () => ({ employeeService: { getEmployees: vi.fn() } }));
vi.mock('../../services/assignedTask.service', () => ({ assignedTaskService: { list: vi.fn(), assign: vi.fn() }, statusLabel: { NOT_STARTED: 'Not started', START: 'Started', PROGRESS: 'In progress', END: 'Completed' } }));
describe('manager task assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assignedTaskService.list).mockResolvedValue([]);
    vi.mocked(employeeService.getEmployees).mockResolvedValue([
      { id: 'mine', name: 'My Employee', role: 'EMPLOYEE', lineManagerId: 'manager', status: 'ACTIVE' },
      { id: 'other', name: 'Other Employee', role: 'EMPLOYEE', lineManagerId: 'other-manager', status: 'ACTIVE' },
    ] as any);
  });
  it('lists every active employee, not only direct reports, and opens progress', async () => {
    vi.mocked(assignedTaskService.assign).mockResolvedValue({ id: 'task' } as any);
    render(<TeamTasks user={{ id: 'manager', role: 'MANAGER' } as any} />);
    await screen.findByRole('option', { name: 'My Employee' });
    expect(screen.getByRole('option', { name: 'Other Employee' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'mine' } });
    fireEvent.change(screen.getByLabelText('Project Selection'), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('New project name'), { target: { value: ' Tower A ' } });
    fireEvent.change(screen.getByLabelText('Task Description'), { target: { value: 'Complete drawing review' } });
    fireEvent.change(screen.getByLabelText('Due Date'), { target: { value: '2026-10-15' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'PROGRESS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign Task' }));
    await waitFor(() => expect(assignedTaskService.assign).toHaveBeenCalledWith('mine', 'Complete drawing review', 'Tower A', '2026-10-15', 'PROGRESS'));
    expect(await screen.findByText('Task assigned. Your employee can now see it.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true');
  });
  it('requires a nonblank project before assigning', async () => {
    render(<TeamTasks user={{id:'manager', role:'MANAGER'} as any} />);
    await screen.findByRole('option', {name:'My Employee'});
    fireEvent.change(screen.getByLabelText('Person'), {target:{value:'mine'}});
    fireEvent.change(screen.getByLabelText('Task Description'), {target:{value:'Review drawing'}});
    expect(screen.getByRole('button', {name:'Assign Task'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Project Selection'), {target:{value:'__new__'}});
    fireEvent.change(screen.getByLabelText('New project name'), {target:{value:'   '}});
    expect(screen.getByRole('button', {name:'Assign Task'})).toBeDisabled();
    expect(assignedTaskService.assign).not.toHaveBeenCalled();
  });
  it('selects existing projects and sorts and filters progress by project', async () => {
    vi.mocked(assignedTaskService.list).mockResolvedValue([
      {id:'b', employee_name:'My Employee', description:'Beta task', project_name:'Beta', status:'END', created:'2026-10-02'},
      {id:'a', employee_name:'My Employee', description:'Alpha task', project_name:'Alpha', project_id:'project-alpha', project_number:1, due_date:'2026-10-15', status:'END', created:'2026-10-01'},
      {id:'old', employee_name:'My Employee', description:'Legacy task', status:'END', created:'2026-09-01'},
    ] as any);
    render(<TeamTasks user={{id:'manager', role:'MANAGER'} as any} />);
    await screen.findByRole('option', {name:'Alpha'});
    fireEvent.change(screen.getByLabelText('Project Selection'), {target:{value:'Alpha'}});
    expect(screen.getAllByText('1', {exact:true})).toHaveLength(2);
    expect(screen.queryByText('project-alpha')).not.toBeInTheDocument();
    expect(screen.getByText('15/10/2026')).toBeInTheDocument();
    expect(screen.queryByLabelText('New project name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', {name:'Progress'}));
    fireEvent.change(screen.getByLabelText('Sort tasks'), {target:{value:'project'}});
    expect(within(screen.getAllByRole('article')[0]).getByText('Alpha task')).toBeInTheDocument();
    expect(screen.getByText('Legacy task')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter by project'), {target:{value:'Beta'}});
    expect(screen.getByText('Beta task')).toBeInTheDocument();
    expect(screen.queryByText('Alpha task')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy task')).not.toBeInTheDocument();
  });
  it('keeps the task form on a failed assignment', async () => {
    vi.mocked(assignedTaskService.assign).mockRejectedValue(new Error('Connection lost'));
    render(<TeamTasks user={{ id: 'manager', role: 'MANAGER' } as any} />);
    await screen.findByRole('option', { name: 'My Employee' });
    fireEvent.change(screen.getByLabelText('Person'), { target: { value: 'mine' } });
    fireEvent.change(screen.getByLabelText('Project Selection'), { target: { value: '__new__' } });
    fireEvent.change(screen.getByLabelText('New project name'), { target: { value: ' Tower A ' } });
    fireEvent.change(screen.getByLabelText('Task Description'), { target: { value: 'Review drawing' } });
    fireEvent.change(screen.getByLabelText('Due Date'), { target: { value: '2026-10-15' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'PROGRESS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign Task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(screen.getByLabelText('Task Description')).toHaveValue('Review drawing');
  });
});
