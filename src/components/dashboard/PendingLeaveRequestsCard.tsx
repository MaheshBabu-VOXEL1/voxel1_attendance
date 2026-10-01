import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { leaveService } from '../../services/leave.service';
import { LeaveRequest } from '../../types';

interface Props {
  managerId: string;
  onNavigate: (path: string, params?: any) => void;
}

const MAX_SHOWN = 5;

const formatDates = (l: LeaveRequest) => {
  const fmt = (d: string) => new Date(d.split(' ')[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const start = fmt(l.startDate);
  const end = fmt(l.endDate);
  return start === end ? start : `${start} – ${end}`;
};

/**
 * Manager dashboard: leave requests waiting for this manager's decision.
 * Tapping one opens it on the Leave page. Refreshes every 30 s and when the
 * app comes back into view, so new requests appear without a reload.
 */
export const PendingLeaveRequestsCard: React.FC<Props> = ({ managerId, onNavigate }) => {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      leaveService.clearCache();
      const leaves = await leaveService.getLeaves();
      setRequests(leaves
        .filter(l => l.status === 'PENDING_MANAGER' && l.lineManagerId === managerId)
        .sort((a, b) => (a.appliedDate || a.startDate).localeCompare(b.appliedDate || b.startDate)));
    } catch {
      /* keep the last list; the next refresh retries */
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const poll = window.setInterval(() => { void refresh(); }, 30_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(poll);
    };
  }, [refresh]);

  const count = requests.length;

  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
      <button
        type="button"
        onClick={() => onNavigate('leave')}
        className="w-full flex items-center justify-between gap-4 text-left"
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${count > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
            <CalendarClock size={24} />
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 leading-none">Leave Requests</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Waiting for your approval</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-semibold leading-none ${count > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{loading ? '…' : count}</p>
          <p className="text-[8px] font-bold text-slate-300 uppercase tracking-widest mt-1">Pending</p>
        </div>
      </button>

      {!loading && count === 0 && (
        <p className="mt-4 text-xs text-slate-400">No leave requests waiting. New requests appear here automatically.</p>
      )}

      {count > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {requests.slice(0, MAX_SHOWN).map(l => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onNavigate('leave', { openLeaveId: l.id })}
                className="w-full flex items-center justify-between gap-3 py-3 text-left hover:bg-slate-50 rounded-xl px-2 -mx-2 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{l.employeeName || 'Employee'}</p>
                  <p className="text-[11px] text-slate-500">
                    {l.type.replace(/_/g, ' ')} · {formatDates(l)} · {l.totalDays} day{l.totalDays === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-primary shrink-0">
                  Review <ChevronRight size={14} />
                </span>
              </button>
            </li>
          ))}
          {count > MAX_SHOWN && (
            <li>
              <button type="button" onClick={() => onNavigate('leave')} className="w-full py-3 text-xs font-semibold text-primary text-center">
                View all {count} requests
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
