import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, X, AlertTriangle } from 'lucide-react';
import { User } from '../../types';
import { hrService } from '../../services/hrService';
import { dailyTaskService, DailyTask } from '../../services/dailyTask.service';
import { buildTaskSheet, taskSheetCsv, TaskSheetPerson } from '../../utils/taskSheet';
import { lastDays, ymd } from '../../utils/attendanceSheet';

interface Props {
  user: User;
  days?: number;
}

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Excel-style Team Tasks: every employee against the last `days` days, the task text in each cell. */
export const TeamTasksSheet: React.FC<Props> = ({ user, days = 10 }) => {
  const [people, setPeople] = useState<TaskSheetPerson[]>([]);
  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<DailyTask | null>(null);

  const today = ymd(new Date());
  const dates = useMemo(() => lastDays(new Date(), days), [today, days]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    Promise.all([
      dailyTaskService.getTeamTasksRange(dates[0], dates[dates.length - 1]),
      hrService.getEmployees().catch(() => []),
    ])
      .then(([rows, emps]) => {
        if (!active) return;
        setTasks(rows);
        // The manager's team is their direct reports; the Admin sees every employee.
        setPeople((emps as any[])
          .filter(e => e.role === 'EMPLOYEE' && e.status !== 'INACTIVE'
            && (user.role === 'ADMIN' || e.lineManagerId === user.id))
          .map(e => ({ id: e.id, name: e.name })));
      })
      .catch(e => active && setError(e.message))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [dates, user.id, user.role]);

  const rows = useMemo(() => buildTaskSheet(people, tasks, dates), [people, tasks, dates]);

  const download = () => {
    const blob = new Blob([taskSheetCsv(rows, dates)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-tasks-${dates[0]}-to-${dates[dates.length - 1]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const label = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return {
      day: date === today ? 'Today' : dt.toLocaleDateString('en-GB', { weekday: 'short' }),
      date: dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    };
  };

  if (isLoading) {
    return <div className="h-64 flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Last {days} Days</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            <span className="md:hidden">Newest day first. Tap a task to read it in full.</span>
            <span className="hidden md:inline">Each cell is the task sent that day. Click a cell to read it in full; – means nothing was sent.</span>
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

      {error && (
        <div className="m-5 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-400">No employees to show.</p>
      ) : (<>
        {/* Phones: the same 10 days as a list, newest day first — ten wide
            text columns do not fit a phone screen. */}
        <div className="md:hidden divide-y divide-slate-100">
          {[...dates].reverse().map(date => {
            const i = dates.indexOf(date);
            const l = label(date);
            return (
              <section key={date} className="px-4 py-3">
                <h3 className={`text-[11px] font-semibold uppercase tracking-widest mb-2 ${date === today ? 'text-primary' : 'text-slate-400'}`}>
                  {l.day} · {l.date}
                </h3>
                <ul className="space-y-2">
                  {rows.map(r => {
                    const task = r.cells[i];
                    return (
                      <li key={r.person.id}>
                        {task ? (
                          <button
                            type="button"
                            onClick={() => setOpen(task)}
                            className="w-full text-left p-3 rounded-xl bg-slate-50 active:bg-slate-100"
                          >
                            <p className="text-xs font-semibold text-slate-800">{r.person.name}</p>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap break-words [overflow-wrap:anywhere] line-clamp-3 mt-0.5">{task.tasks}</p>
                          </button>
                        ) : (
                          <div className="flex items-center justify-between p-3 rounded-xl border border-dashed border-slate-200">
                            <p className="text-xs font-semibold text-slate-600">{r.person.name}</p>
                            <p className="text-[11px] text-slate-400">Not sent</p>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-10 bg-slate-50 text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500 border-r border-slate-100 min-w-[150px]">Employee</th>
                {dates.map(d => {
                  const l = label(d);
                  return (
                    <th key={d} className={`px-2 py-2 text-center border-r border-slate-100 min-w-[160px] ${d === today ? 'bg-primary-light/60' : ''}`}>
                      <div className="text-[9px] font-semibold uppercase text-slate-400">{l.day}</div>
                      <div className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">{l.date}</div>
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-emerald-600 min-w-[64px]">Sent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.person.id} className="border-t border-slate-100 align-top">
                  <td className="sticky left-0 z-10 bg-white px-4 py-3 border-r border-slate-100 font-semibold text-slate-800">{r.person.name}</td>
                  {r.cells.map((task, i) => (
                    <td key={dates[i]} className={`px-2 py-2 border-r border-slate-100 ${dates[i] === today ? 'bg-primary-light/30' : ''}`}>
                      {task ? (
                        <button
                          type="button"
                          onClick={() => setOpen(task)}
                          title={task.tasks}
                          className="w-full text-left text-xs text-slate-700 whitespace-pre-wrap [overflow-wrap:anywhere] line-clamp-3 hover:text-primary"
                        >
                          {task.tasks}
                        </button>
                      ) : (
                        <span className="block text-center text-slate-300 font-bold">–</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center font-semibold text-emerald-700">{r.sentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}

      {open && (
        <div className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <p className="font-semibold text-slate-900">{open.employeeName}</p>
                <p className="text-xs text-slate-500">
                  {new Date(`${open.taskDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · sent {formatTime(open.submittedAt)}
                </p>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close" className="p-2 rounded-lg hover:bg-slate-100"><X size={18} /></button>
            </div>
            <p className="px-6 py-5 text-sm text-slate-700 whitespace-pre-wrap break-words">{open.tasks}</p>
          </div>
        </div>
      )}
    </div>
  );
};
