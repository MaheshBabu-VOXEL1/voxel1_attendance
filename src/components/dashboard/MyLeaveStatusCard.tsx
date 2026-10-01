import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, XCircle, Clock, ArrowRight } from 'lucide-react';
import { LeaveRequest } from '../../types';
import { leaveStatusLabel, dashboardLeaves } from '../../utils/leaveStatus';
import { leaveService } from '../../services/leave.service';

interface Props {
  /** Requests to show (already filtered with dashboardLeaves). */
  leaves: LeaveRequest[];
  onNavigate: (path: string, params?: any) => void;
  /** When given, the card refreshes itself so the manager's decision appears without a reload. */
  employeeId?: string;
}

const statusStyle = (status: string) => {
  switch (status) {
    case 'APPROVED': return { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 };
    case 'REJECTED': return { cls: 'bg-rose-50 text-rose-700 border-rose-200', Icon: XCircle };
    default:         return { cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: Clock };
  }
};

const formatDate = (d: string) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '';

const decidedAt = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? `today ${time}` : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
};

/**
 * Employee dashboard card: every request still waiting for the manager, plus
 * requests the manager approved or rejected in the last 24 hours (with the
 * decision and remark). Older ones are only on the Leave page.
 */
export const MyLeaveStatusCard: React.FC<Props> = ({ leaves: initial, onNavigate, employeeId }) => {
  const [leaves, setLeaves] = useState(initial);
  useEffect(() => { setLeaves(initial); }, [initial]);

  const refresh = useCallback(async () => {
    if (!employeeId) return;
    try {
      leaveService.clearCache();
      setLeaves(dashboardLeaves(await leaveService.getLeaves(), employeeId));
    } catch { /* keep the last list; the next refresh retries */ }
  }, [employeeId]);

  useEffect(() => {
    if (!employeeId) return;
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const poll = window.setInterval(() => { void refresh(); }, 30_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(poll);
    };
  }, [employeeId, refresh]);

  return (
  <div className="bg-white p-4 md:p-5 rounded-2xl md:rounded-[2rem] border border-slate-100 shadow-sm flex flex-col gap-3 animate-in slide-in-from-bottom-4">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-primary">
        <div className="p-1.5 bg-primary-light rounded-lg"><CalendarCheck size={14} /></div>
        <span className="text-[8px] font-semibold uppercase tracking-widest text-slate-400">My Leave Requests</span>
      </div>
      <button
        onClick={() => onNavigate('leave')}
        className="flex items-center gap-1 px-2 py-2 -my-2 -mr-2 min-h-[40px] rounded-lg text-[10px] font-bold text-primary opacity-80 hover:opacity-100 transition-opacity"
      >
        View all <ArrowRight size={14} />
      </button>
    </div>

    {leaves.length === 0 ? (
      <p className="text-xs md:text-sm text-slate-500 pl-1">No leave requests waiting. Past requests are on the Leave page.</p>
    ) : (
      <ul className="space-y-2">
        {leaves.map(leave => {
          const { cls, Icon } = statusStyle(leave.status);
          const remark = leave.managerRemarks || leave.approverRemarks;
          const range = leave.startDate === leave.endDate
            ? formatDate(leave.startDate)
            : `${formatDate(leave.startDate)} – ${formatDate(leave.endDate)}`;
          return (
            <li key={leave.id}>
              <button
                onClick={() => onNavigate('leave', { openLeaveId: leave.id })}
                className="w-full text-left p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs md:text-sm font-semibold text-slate-800 truncate">{leave.type}</p>
                    <p className="text-[11px] text-slate-500">{range} · {leave.totalDays} day{leave.totalDays === 1 ? '' : 's'}</p>
                  </div>
                  <span className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-bold uppercase tracking-wide flex-shrink-0 ${cls}`}>
                    <Icon size={11} /> {leaveStatusLabel(leave.status)}
                  </span>
                </div>
                {(leave.status === 'APPROVED' || leave.status === 'REJECTED') && leave.updated && (
                  <p className="mt-1.5 text-[10px] text-slate-400">
                    {leave.status === 'APPROVED' ? 'Approved' : 'Rejected'} by your manager {decidedAt(leave.updated)}
                  </p>
                )}
                {remark && (leave.status === 'APPROVED' || leave.status === 'REJECTED') && (
                  <p className="mt-2 text-[11px] text-slate-600 italic line-clamp-2">“{remark}”</p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);
};
