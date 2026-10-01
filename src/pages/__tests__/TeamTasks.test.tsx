import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TeamTasks from '../TeamTasks';
import { employeeService } from '../../services/employee.service';
import { assignedTaskService } from '../../services/assignedTask.service';
vi.mock('../../services/employee.service', () => ({ employeeService: { getEmployees: vi.fn() } }));
vi.mock('../../services/assignedTask.service', () => ({ assignedTaskService: { list: vi.fn(), assign: vi.fn() }, statusLabel: { END: 'Completed' } }));
describe('manager task assignments', () => {
  beforeEach(() => {
    vi.mocked(assignedTaskService.list).mockResolvedValue([]);
    vi.mocked(employeeService.getEmployees).mockResolvedValue([
      { id: 'mine', name: 'My Employee', role: 'EMPLOYEE', lineManagerId: 'manager', status: 'ACTIVE' },
      { id: 'other', name: 'Other Employee', role: 'EMPLOYEE', lineManagerId: 'other-manager', status: 'ACTIVE' },
    ] as any);
  });
  it('assigns a task to a direct report and opens progress', async () => {
    vi.mocked(assignedTaskService.assign).mockResolvedValue({ id: 'task' } as any);
    render(<TeamTasks user={{ id: 'manager', role: 'MANAGER' } as any} />);
    await screen.findByRole('option', { name: 'My Employee' });
    expect(screen.queryByRole('option', { name: 'Other Employee' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Employee'), { target: { value: 'mine' } });
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'Complete drawing review' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign Task' }));
    await waitFor(() => expect(assignedTaskService.assign).toHaveBeenCalledWith('mine', 'Complete drawing review'));
    expect(await screen.findByText('Task assigned. Your employee can now see it.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true');
  });
  it('keeps the task form on a failed assignment', async () => {
    vi.mocked(assignedTaskService.assign).mockRejectedValue(new Error('Connection lost'));
    render(<TeamTasks user={{ id: 'manager', role: 'MANAGER' } as any} />);
    await screen.findByRole('option', { name: 'My Employee' });
    fireEvent.change(screen.getByLabelText('Employee'), { target: { value: 'mine' } });
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'Review drawing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Assign Task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    expect(screen.getByLabelText('Task')).toHaveValue('Review drawing');
  });
});

