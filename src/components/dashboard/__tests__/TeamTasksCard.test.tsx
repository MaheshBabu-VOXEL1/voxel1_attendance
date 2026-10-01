import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamTasksCard } from '../TeamTasksCard';
import { assignedTaskService } from '../../../services/assignedTask.service';
vi.mock('../../../services/assignedTask.service', () => ({
 assignedTaskService: { list: vi.fn() }, statusLabel: { END: 'Completed', PROGRESS: 'In progress' },
}));
describe('manager progress dashboard', () => {
 it('shows completed tasks and opens the Progress tab', async () => {
   vi.mocked(assignedTaskService.list).mockResolvedValue([
    { id:'a', employee_name:'Test Employee', description:'Review drawing', status:'END' },
    { id:'b', employee_name:'Another Employee', description:'Check model', status:'PROGRESS' },
   ] as any);
   const navigate = vi.fn();
   render(<TeamTasksCard onNavigate={navigate} />);
   expect(await screen.findByText('Completed')).toBeInTheDocument();
   expect(screen.getByText('1 completed / 2 assigned')).toBeInTheDocument();
   fireEvent.click(screen.getByRole('button', { name: 'View Progress' }));
   expect(navigate).toHaveBeenCalledWith('team-tasks', { tab:'PROGRESS' });
 });
});

