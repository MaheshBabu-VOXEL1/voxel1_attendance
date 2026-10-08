import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, Download } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { Attendance, Employee, Holiday, LeaveRequest } from '../../types';
import { buildAttendanceSheet, attendanceSheetCsv, lastDays, ymd, SheetCell } from '../../utils/attendanceSheet';

interface Props {
  /** People to list; only employees get a row (the Manager and Admins do not mark attendance here). */
  employees: Employee[];
  logs: Attendance[];
  workingDays: string[];
  days?: number;
}

const Mark: React.FC<{ cell: SheetCell }> = ({ cell }) => {
  switch (cell.mark) {
    case 'PRESENT':
      return <span title={cell.detail} className="inline-flex w-6 h-6 sm:w-7 sm:h-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><Check size={16} strokeWidth={3} /></span>;
    case 'ABSENT':
      return <span title={cell.detail} className="inline-flex w-6 h-6 sm:w-7 sm:h-7 items-center justify-center rounded-lg bg-rose-100 text-rose-600"><X size={16} strokeWidth={3} /></span>;
    case 'LEAVE':
      return <span title={cell.detail} className="inline-flex w-6 h-6 sm:w-7 sm:h-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700 text-xs font-bold">L</span>;
    default:
      return <span title={cell.detail} className="inline-flex w-6 h-6 sm:w-7 sm:h-7 items-center justify-center text-slate-300 font-bold">–</span>;
  }
};

/** Excel-style sheet: every employee against the last `days` days, ✓ present / ✗ absent. */
export const AttendanceSheet: React.FC<Props> = ({ employees, logs, workingDays, days = 10 }) => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);

  useEffect(() => {
    hrService.getHolidays().then(setHolidays).catch(() => setHolidays([]));
    hrService.getLeaves().then(setLeaves).catch(() => setLeaves([]));
  }, []);

  const today = ymd(new Date());
  // Open scrolled to the latest days, so today is on screen even on a phone.
  const scroller = useRef<HTMLDivElement>(null);
  const dates = useMemo(() => lastDays(new Date(), days), [today, days]);
  const rows = useMemo(() => buildAttendanceSheet({
    employees: employees.filter(e => e.role === 'EMPLOYEE' && e.status !== 'INACTIVE')
      .sort((a, b) => a.name.localeCompare(b.name)),
    logs, holidays, leaves, workingDays, dates, today,
  }), [employees, logs, holidays, leaves, workingDays, dates, today]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [rows.length]);

  const download = () => {
    const blob = new Blob([attendanceSheetCsv(rows, dates)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${dates[0]}-to-${dates[dates.length - 1]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const label = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return {
      day: dt.toLocaleDateString('en-GB', { weekday: 'short' }),
      date: dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      // Phones: one letter + the day number keeps about a week on screen.
      dayShort: dt.toLocaleDateString('en-GB', { weekday: 'narrow' }),
      dateShort: String(dt.getDate()),
    };
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Last {days} Days</h2>
          <p className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
            <span><span className="text-emerald-600 font-bold">✓</span> Present</span>
            <span><span className="text-rose-600 font-bold">✗</span> Absent</span>
            <span><span className="text-sky-700 font-bold">L</span> Leave</span>
            <span><span className="text-slate-400 font-bold">–</span> Holiday / weekend / not yet</span>
          </p>
          <p className="text-[11px] text-amber-700 mt-1.5">
            This sheet shows the last {days} days. Attendance records are kept indefinitely; download the full monthly workbook from Team Tasks.
          </p>
        </div>
        <button
          onClick={download}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold hover:bg-emerald-700 disabled:opacity-40"
        >
          <Download size={14} /> Download Excel
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-400">No employees to show.</p>
      ) : (
        <div ref={scroller} className="overflow-x-auto overscroll-x-contain">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-10 bg-slate-50 text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500 border-r border-slate-100 min-w-[96px] sm:min-w-[160px]">Employee</th>
                {dates.map(d => {
                  const l = label(d);
                  return (
                    <th key={d} className={`px-1 sm:px-2 py-2 text-center border-r border-slate-100 min-w-[36px] sm:min-w-[56px] ${d === today ? 'bg-primary-light/60' : ''}`}>
                      <div className="text-[9px] font-semibold uppercase text-slate-400">
                        <span className="sm:hidden">{d === today ? 'Now' : l.dayShort}</span>
                        <span className="hidden sm:inline">{d === today ? 'Today' : l.day}</span>
                      </div>
                      <div className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                        <span className="sm:hidden">{l.dateShort}</span>
                        <span className="hidden sm:inline">{l.date}</span>
                      </div>
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-emerald-600 min-w-[40px] sm:min-w-[56px]"><span className="sm:hidden">✓</span><span className="hidden sm:inline">Present</span></th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-rose-600 min-w-[40px] sm:min-w-[56px]"><span className="sm:hidden">✗</span><span className="hidden sm:inline">Absent</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.employee.id} className="border-t border-slate-100">
                  <td className="sticky left-0 z-10 bg-white px-3 sm:px-4 py-3 border-r border-slate-100">
                    <div className="font-semibold text-slate-800 truncate max-w-[96px] sm:max-w-[180px]">{r.employee.name}</div>
                    {r.employee.employeeId && <div className="text-[10px] text-slate-400">{r.employee.employeeId}</div>}
                  </td>
                  {r.cells.map((c, i) => (
                    <td key={dates[i]} className={`px-1 sm:px-2 py-2 text-center border-r border-slate-100 ${dates[i] === today ? 'bg-primary-light/30' : ''}`}>
                      <Mark cell={c} />
                    </td>
                  ))}
                  <td className="px-2 sm:px-3 py-2 text-center font-semibold text-emerald-700">{r.presentCount}</td>
                  <td className="px-2 sm:px-3 py-2 text-center font-semibold text-rose-600">{r.absentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
