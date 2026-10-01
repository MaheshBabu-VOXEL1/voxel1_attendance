import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AssignedTaskList } from './AssignedTaskList';
import { assignedTaskService } from '../../services/assignedTask.service';
vi.mock('../../services/assignedTask.service', () => ({
 assignedTaskService: { setStatus: vi.fn() },
 statusLabel: { NOT_STARTED: 'Not started', START: 'Started', PROGRESS: 'In progress', END: 'Completed' },
}));
const task = { id:'task', employee_name:'Employee', manager_name:'Manager', description:'Review drawing', status:'NOT_STARTED', created:'2026-09-29T10:00:00Z', completed_at:null } as any;
describe('employee task status controls', () => {
 it.each([['Start','START'],['Progress','PROGRESS'],['End','END']])('saves %s without task text editing', async (label, value) => {
  vi.mocked(assignedTaskService.setStatus).mockResolvedValue({ ...task, status:value });
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(<AssignedTaskList tasks={[task]} editable onUpdated={refresh} />);
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio', { name:label }));
  await waitFor(() => expect(assignedTaskService.setStatus).toHaveBeenLastCalledWith('task', value));
  await waitFor(() => expect(refresh).toHaveBeenCalled());
 });
 it('does not show a successful status after a failed save', async () => {
  vi.mocked(assignedTaskService.setStatus).mockRejectedValue(new Error('Save failed'));
  render(<AssignedTaskList tasks={[task]} editable />);
  fireEvent.click(screen.getByRole('radio', { name:'End' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
  expect(screen.getByRole('radio', { name:'End' })).not.toBeChecked();
 });
});

