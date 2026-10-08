import { useState } from 'react';
import { Download } from 'lucide-react';
import { downloadMonthlyReport } from '../../services/monthlyReport.service';
import { indiaDate } from '../../utils/monthlyReports';

export function MonthlyReportDownload() {
  const [month, setMonth] = useState(() => indiaDate().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const download = async () => {
    setBusy(true); setError('');
    try { await downloadMonthlyReport(month); }
    catch (e) { setError(e instanceof Error ? e.message : 'Download failed. Please try again.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-2">
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm text-slate-600">Report month<input aria-label="Report month" type="month" value={month} max={indiaDate().slice(0, 7)} onChange={e => setMonth(e.target.value)} disabled={busy} className="mt-1 block min-h-11 rounded-lg border border-slate-200 bg-white p-2" /></label>
      <button type="button" disabled={busy || !month} onClick={() => void download()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Download size={17} />{busy ? 'Preparing Excel…' : 'Download monthly Excel'}</button>
    </div>
    <p className="text-xs text-slate-500">Attendance, employee details, assigned tasks and progress in one .xlsx workbook. Includes records you can access.</p>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
