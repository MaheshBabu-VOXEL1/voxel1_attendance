import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TodayTeamTasks, { indiaDay, isTodayTask } from './TodayTeamTasks';
import { AssignedTask } from '../../services/assignedTask.service';
vi.mock('../../services/assignedTask.service', () => ({ assignedTaskService: { listDailyComments: vi.fn(async () => [
  { id: 'c1', task_id: 'old', author_name: 'Employee One', body: 'Waiting for dimensions', created_at: new Date().toISOString() },
]) } }));
const task = (fields: Partial<AssignedTask>) => ({ id: 'old', employee_id: 'e1', employee_name: 'Employee One', description: 'Earlier task', status: 'END', created: '2020-01-01T00:00:00Z', ...fields } as AssignedTask);
describe('daily team updates', () => {
  it('uses India midnight, includes active older work and today completion, excludes stale completed and future recurring tasks', () => {
    expect(indiaDay('2026-11-02T20:00:00Z')).toBe('2026-11-03');
    expect(isTodayTask(task({ status: 'PROGRESS' }), '2026-11-03', [])).toBe(true);
    expect(isTodayTask(task({ completed_at: '2026-11-02T20:00:00Z' }), '2026-11-03', [])).toBe(true);
    expect(isTodayTask(task({ completed_at: '2026-11-01T20:00:00Z' }), '2026-11-03', [])).toBe(false);
    expect(isTodayTask(task({ status: 'PROGRESS', occurrence_date: '2026-11-04' }), '2026-11-03', [])).toBe(false);
  });
  it('shows a comment-only update on an older task, missing employees and status filters', async () => {
    render(<TodayTeamTasks tasks={[task({})]} employees={[
      { id: 'e1', name: 'Employee One' }, { id: 'e2', name: 'Employee Two' },
    ] as any} project="all" query="" loading={false} onOpen={vi.fn()} />);
    expect(await screen.findByText('Waiting for dimensions')).toBeInTheDocument();
    expect(screen.getByText('Earlier task')).toBeInTheDocument();
    expect(screen.getByText('No update today')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'No update' }));
    expect(screen.getByText('Employee Two')).toBeInTheDocument();
    expect(screen.queryByText('Earlier task')).not.toBeInTheDocument();
  });
  it('hides open tasks of people no longer on the active roster', async () => {
    render(<TodayTeamTasks tasks={[task({ id: 'gone', employee_id: 'x9', employee_name: 'Former Member', description: 'Left behind', status: 'START' })]}
      employees={[{ id: 'e1', name: 'Employee One' }] as any} project="all" query="" loading={false} onOpen={vi.fn()} />);
    expect(await screen.findByText('Employee One')).toBeInTheDocument();
    expect(screen.queryByText('Former Member')).not.toBeInTheDocument();
    expect(screen.queryByText('Left behind')).not.toBeInTheDocument();
  });
});
