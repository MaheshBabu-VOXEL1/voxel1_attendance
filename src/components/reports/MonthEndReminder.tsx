import { useEffect, useState } from 'react';
import { indiaDate, isMonthEnd } from '../../utils/monthlyReports';
import { MonthlyReportDownload } from './MonthlyReportDownload';

/** Last five India-calendar days of the month: remind managers to download the monthly Excel. Nothing is deleted. */
export function MonthEndReminder({ userId }: { userId: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 60 * 60 * 1000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [userId]);
  if (!isMonthEnd(now)) return null;
  const month = new Date(indiaDate(now) + 'T00:00:00+05:30').toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' });
  return <aside role="status" aria-label="Month-end download reminder" className="mb-6 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-5">
    <h2 className="font-semibold text-amber-950">Download your monthly Excel report</h2>
    <p className="text-sm text-amber-900">{month} is ending. Download the monthly report with attendance, employee details, assigned tasks and task progress for your records.</p>
    <MonthlyReportDownload />
  </aside>;
}
