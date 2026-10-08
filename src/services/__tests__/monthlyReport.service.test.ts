import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadMonthlyReport } from '../monthlyReport.service';
import { downloadWorkbook } from '../../utils/monthlyReports';
const { from, result, calls } = vi.hoisted(() => ({ from: vi.fn(), result: vi.fn(), calls: [] as string[] }));
vi.mock('../supabase', () => ({ supabase: { from } }));
vi.mock('../api.client', () => ({ resolveOrgId: async () => 'my-org' }));
vi.mock('../../utils/monthlyReports', async importOriginal => ({ ...await importOriginal<object>(), downloadWorkbook: vi.fn() }));

describe('monthly report fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks(); calls.length = 0;
    from.mockImplementation((table: string) => {
      const q: any = {};
      for (const method of ['select','eq','order','gte','lt']) q[method] = vi.fn(() => q);
      q.range = vi.fn((offset: number) => {
        calls.push(`${table}:${offset}`);
        const page = result(table, offset);
        q.then = (resolve: (value: unknown) => unknown) => Promise.resolve(page).then(resolve);
        return q;
      });
      return q;
    });
    result.mockReturnValue({ data: [], error: null });
  });
  it('reads all pages instead of silently truncating a monthly archive', async () => {
    result.mockImplementation((table, offset) => ({ data: table === 'attendance' ? Array.from({ length: offset === 0 ? 500 : 1 }, () => ({ employee_name:'Employee',date:'2026-10-08' })) : [], error: null }));
    await downloadMonthlyReport('2026-10');
    expect(calls).toContain('attendance:500');
    const sheets = vi.mocked(downloadWorkbook).mock.calls[0][0];
    expect(sheets.find(s => s.sheet === 'Attendance')?.data).toHaveLength(502);
    expect(downloadWorkbook).toHaveBeenCalledWith(expect.anything(), 'voxel1-monthly-report-2026-10.xlsx');
  });
  it('does not download a misleading workbook when a database read fails', async () => {
    result.mockReturnValue({ data: null, error: { message:'Connection failed' } });
    await expect(downloadMonthlyReport('2026-10')).rejects.toThrow('Connection failed');
    expect(downloadWorkbook).not.toHaveBeenCalled();
  });
});
