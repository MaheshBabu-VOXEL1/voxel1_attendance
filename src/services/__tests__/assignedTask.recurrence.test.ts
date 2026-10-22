import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assignedTaskService } from '../assignedTask.service';
import { supabase } from '../supabase';

vi.mock('../supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

describe('recurring task service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the task and its schedule in a single atomic RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { id: 'task' }, error: null } as any);
    await assignedTaskService.createRecurring('employee', ' Report ', ' Project ', '', [1, 4]);
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith('create_recurring_task', {
      p_employee_id: 'employee', p_description: 'Report', p_project_name: 'Project',
      p_start_date: null, p_days: [1, 4], p_status: 'NOT_STARTED',
    });
  });

  it('does not report success when the schedule could not be saved', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'Only managers' } } as any);
    await expect(assignedTaskService.setRecurrence('task', [1])).rejects.toThrow('Only managers');
  });

  it('loads existing employee tasks before the recurrence migration is installed', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Function missing' } } as any);
    const rows = [{ id: 'existing', description: 'Existing task' }];
    const query: any = { select: vi.fn(() => query), order: vi.fn(() => query), range: vi.fn(() => query),
      eq: vi.fn(async () => ({ data: rows, error: null })), or: vi.fn() };
    vi.mocked(supabase.from).mockReturnValue(query);
    await expect(assignedTaskService.list('employee')).resolves.toEqual(rows);
    expect(query.or).not.toHaveBeenCalled();
  });

  it('explains the required migration when recurring creation is unavailable', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Function missing' } } as any);
    await expect(assignedTaskService.createRecurring(null, 'Report', 'Project', '', [1])).rejects.toThrow('Apply migration 0094_recurring_tasks.sql');
  });

  it('still surfaces database errors other than a missing recurrence function', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: '42501', message: 'Access denied' } } as any);
    await expect(assignedTaskService.list()).rejects.toThrow('Access denied');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('materializes due occurrences before fetching and hides future employee occurrences in India time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T20:00:00Z'));
    try {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any);
      const query: any = { select: vi.fn(() => query), order: vi.fn(() => query), range: vi.fn(() => query),
        eq: vi.fn(() => query), or: vi.fn(async () => ({ data: [], error: null })) };
      vi.mocked(supabase.from).mockReturnValue(query);
      await expect(assignedTaskService.list('employee')).resolves.toEqual([]);
      expect(supabase.rpc).toHaveBeenCalledWith('materialize_recurring_tasks');
      expect(query.eq).toHaveBeenCalledWith('employee_id', 'employee');
      expect(query.or).toHaveBeenCalledWith('occurrence_date.is.null,occurrence_date.lte.2026-10-26');
      expect(vi.mocked(supabase.rpc).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(supabase.from).mock.invocationCallOrder[0]);
    } finally { vi.useRealTimers(); }
  });
});
