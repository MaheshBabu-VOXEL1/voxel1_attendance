import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { hrService } from '../services/hrService';
import { employeeService } from '../services/employeeService';
import { assignedTaskService, AssignedTask, TaskStatus } from '../services/assignedTask.service';
import { useAssignedTasks } from '../hooks/useAssignedTasks';
import { Attendance, CustomLeaveType, LeaveBalance, LeaveRequest } from '../types';
import { DEFAULT_LEAVE_TYPES } from '../constants';
import { ymd } from '../utils/attendanceSheet';
import { useTheme } from '../context/ThemeContext';
import { useSubscription } from '../context/SubscriptionContext';
import './EmployeeDay.css';

const date = (s: string) => new Date(`${s}T12:00:00`);
const short = (s: string) => date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function EmployeeDay({ user, onNavigate }: { user: any; onNavigate: (path: string) => void }) {
  const { darkMode } = useTheme();
  const { canPerformAction } = useSubscription();
  const canWrite = canPerformAction('write');
  const { tasks, loading, error: taskError, refresh } = useAssignedTasks(user.id);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [attendance, setAttendance] = useState<Attendance>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState(false);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [undo, setUndo] = useState<AssignedTask | null>(null);
  const [workingDays, setWorkingDays] = useState<string[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState<CustomLeaveType[]>(DEFAULT_LEAVE_TYPES.filter(t => t.hasBalance));
  const TYPES = leaveTypes.map(t => t.id);
  const label = (id: string) => (leaveTypes.find(t => t.id === id)?.name || id).replace(/ Leave$/, '');
  const [type, setType] = useState('');
  const [when, setWhen] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [half, setHalf] = useState(false);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const sheet = useRef<HTMLDialogElement>(null);
  const apply = useRef<HTMLButtonElement>(null);
  const today = ymd(new Date());
  const tomorrowDate = date(today); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = ymd(tomorrowDate);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [bal, requests, active, logs, config, shift, hols, types] = await Promise.all([
          hrService.getLeaveBalance(user.id), hrService.getLeaves(), hrService.getActiveAttendance(user.id),
          hrService.getAttendance({ employeeId: user.id, since: today, until: today }), hrService.getConfig(),
          hrService.resolveShiftForEmployee(user.id, user.shiftId), hrService.getHolidays(),
          hrService.getLeaveTypes().catch(() => DEFAULT_LEAVE_TYPES),
        ]);
        if (!alive) return;
        const withBalance = types.filter(t => t.hasBalance);
        if (withBalance.length) setLeaveTypes(withBalance);
        setBalance(bal); setLeaves(requests.filter(l => l.employeeId === user.id));
        setAttendance(active || logs.filter(l => l.date === today).sort((a,b) => (b.checkIn || '').localeCompare(a.checkIn || ''))[0]);
        setWorkingDays((shift?.workingDays || config.workingDays || []).map(d => d.slice(0,3).toUpperCase()));
        setHolidays(hols.map(h => h.date)); setReady(true);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Could not load your day. Please reload.'); }
    };
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30000);
    window.addEventListener('focus', load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', load); };
  }, [user.id, user.shiftId, today]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => { setMessage(''); setUndo(null); }, 6000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!open) return;
    sheet.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const close = () => { sheet.current?.close(); setOpen(false); apply.current?.focus(); };
  const showLeave = () => { setType(TYPES[0] || ''); setWhen(''); setFrom(''); setTo(''); setHalf(false); setNote(''); setFormError(''); setOpen(true); };
  const start = when === 'today' ? today : when === 'tomorrow' ? tomorrow : from;
  const end = when === 'pick' ? to || from : start;
  let days = 0;
  if (start && end && end >= start) {
    for (let d = date(start); d <= date(end); d.setDate(d.getDate() + 1)) {
      if (workingDays.includes(d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()) && !holidays.includes(ymd(d))) days++;
    }
    if (half && start === end && days) days = 0.5;
  }
  const remaining = Number(balance?.[type] || 0);
  const validation = !start ? '' : start < today ? 'Choose today or a future date.' : end < start ? 'End date is before the start date.' : !days ? 'These dates fall on non-working days.' : leaves.some(l => l.status !== 'REJECTED' && l.startDate <= end && l.endDate >= start) ? 'You already have a leave request on these dates.' : days > remaining ? `Only ${remaining} ${label(type).toLowerCase()} days left.` : '';
  const submitLeave = async () => {
    if (!canWrite || busy || !days || validation || !note.trim()) return;
    setBusy('leave'); setFormError('');
    try {
      await employeeService.applyForLeave({ type, startDate: start, endDate: end, totalDays: days, reason: note.trim() }, user);
      const requests = await hrService.getLeaves(); setLeaves(requests.filter(l => l.employeeId === user.id));
      close(); setMessage(`${label(type)} leave request sent`);
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not send request.'); }
    finally { setBusy(''); }
  };
  const updateTask = async (task: AssignedTask, status: TaskStatus, undoing = false) => {
    if (busy || !canWrite) return;
    setBusy(task.id); setError('');
    try {
      await assignedTaskService.setStatus(task.id, status); await refresh();
      setUndo(status === 'END' && !undoing ? task : null);
      setMessage(undoing ? 'Change undone' : status === 'END' ? 'Marked done' : status === 'NOT_STARTED' ? 'Paused' : status === 'STUCK' ? 'Marked stuck. Your manager can see it.' : task.status === 'END' ? 'Reopened task' : 'Started task');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update task.'); }
    finally { setBusy(''); }
  };
  const doneToday = (t: AssignedTask) => t.status === 'END' && !!t.completed_at && ymd(new Date(t.completed_at)) === today;
  const old = (t: AssignedTask) => t.status === 'END' && !doneToday(t);
  const visible = tasks.filter(t => (!old(t) || history || query.trim()) && [t.description, t.project_name || ''].some(value => value.toLowerCase().includes(query.trim().toLowerCase())));
  const active = !!attendance?.checkIn && !attendance.checkOut;
  const punchTime = active ? attendance?.checkIn : attendance?.checkOut;
  const upcoming = leaves.filter(l => l.endDate >= today).sort((a,b) => a.startDate.localeCompare(b.startDate));

  return <div className="employee-day" data-theme={darkMode ? 'dark' : 'light'}>
    <header className="appbar"><div className="appbar-in"><a className="lockup" href="#/dashboard" aria-label="Voxel1 home"><img src="/img/employee-day-mark.png" alt="" /><span className="wm"><b>VOXEL1</b></span></a><span className="chip-date chip-name" title={user.name || undefined}>{user.name || date(today).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })}</span></div></header>
    <main className="wrap">
      <section className="hero" aria-labelledby="dayTitle"><h1 id="dayTitle">{date(today).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long' })}</h1>
        <div className="att"><div className="att-l"><span className={`dot${active ? '' : ' off'}`} /><div><b>{!ready ? 'Loading attendance…' : active ? 'Checked in' : attendance?.checkOut ? 'Checked out' : 'Not checked in'}</b><span>{punchTime ? `at ${punchTime}` : 'Start your day'}</span></div></div><button className={`btn att-btn ${active ? 'leave-btn' : 'in'}`} disabled={!ready || !canWrite} onClick={() => onNavigate(active ? 'attendance-finish' : 'attendance-quick-office')}>{active ? 'Check out' : 'Check in'}</button></div>
      </section>
      {error && <p className="err" role="alert">{error}</p>}
      <section className="card leave" aria-labelledby="leaveTitle"><div className="row-h"><h2 id="leaveTitle">Leave balance</h2><button ref={apply} className="linkbtn" onClick={showLeave} disabled={!ready || !canWrite}>Apply leave</button></div><div className="bal">{TYPES.map(t => <div key={t}><b>{balance ? Number(balance[t] || 0) : '–'}</b><span>{label(t)}</span></div>)}</div>
        <div className="upc"><h3>Upcoming leave requests</h3>{!ready ? <span>Loading requests…</span> : !upcoming.length ? <span>No upcoming requests</span> : upcoming.map(l => <div className="lv" key={l.id}><div className="cal"><b>{date(l.startDate).getDate()}</b><span>{date(l.startDate).toLocaleDateString('en-GB',{month:'short'})}</span></div><div className="t"><b>{label(l.type)} leave</b><span>{l.startDate === l.endDate ? date(l.startDate).toLocaleDateString('en-GB',{weekday:'long'}) : `${short(l.startDate)} – ${short(l.endDate)}`}, {l.totalDays === 0.5 ? 'Half day' : `${l.totalDays} ${l.totalDays === 1 ? 'day' : 'days'}`}</span></div><span className={`pill ${l.status === 'APPROVED' ? 'ok' : l.status === 'REJECTED' ? 'bad' : 'pend'}`}>{l.status === 'APPROVED' ? '✓ Approved' : l.status === 'REJECTED' ? '× Rejected' : '◷ Pending'}</span></div>)}</div>
      </section>
      <div className="tasks-h"><h2>My Tasks</h2><span>{tasks.filter(t => t.status !== 'END').length} open · {tasks.filter(doneToday).length} done today</span></div>
      <div className="search"><Search size={18} /><label htmlFor="task-query" className="vh">Search project or task</label><input id="task-query" type="search" placeholder="Search project or task" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div className="list" aria-live="polite">{taskError ? <p className="empty" role="alert">{taskError}</p> : loading ? <p className="empty">Loading tasks…</p> : !visible.length ? <p className="empty">{query ? `No tasks match “${query}”` : 'All clear for today'}</p> : visible.map(t => {
        const done = t.status === 'END', progress = t.status === 'START' || t.status === 'PROGRESS', stuck = t.status === 'STUCK';
        return <div className={`task${done ? ' done' : ''}`} key={t.id}><div className="t"><div className="meta"><span className="p">Project: {t.project_name || 'No project'}</span><span className={`d${stuck ? ' stuck' : progress ? ' prog' : ''}`}>{done ? doneToday(t) ? 'Done today' : t.completed_at ? `Done ${short(ymd(new Date(t.completed_at)))}` : 'Done' : stuck ? 'Stuck' : progress ? 'In progress' : 'Not started'}</span></div><div className="ttl">{t.description}</div>{t.created && <div className="assigned-date">Assigned <time dateTime={t.created}>{new Date(t.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</time></div>}</div>{done ? <div className="donebox"><span className="ok"><Check size={13} />Done</span><button disabled={!!busy || !canWrite} onClick={() => updateTask(t,'START')}>Reopen</button></div> : <div className="seg"><button className={progress ? 'on' : ''} disabled={!!busy || !canWrite} onClick={() => updateTask(t,progress ? 'NOT_STARTED' : 'START')}>{progress ? 'Pause' : 'Start'}</button><button className={stuck ? 'on stuck' : ''} aria-pressed={stuck} disabled={!!busy || !canWrite} onClick={() => updateTask(t, stuck ? 'PROGRESS' : 'STUCK')}>Stuck</button><button disabled={!!busy || !canWrite} onClick={() => updateTask(t,'END')}>Done</button></div>}</div>;
      })}</div>
      {!query.trim() && tasks.some(old) && <button className={`more${history ? ' open' : ''}`} aria-expanded={history} onClick={() => setHistory(!history)}>{history ? 'Hide finished tasks' : `Show more (${tasks.filter(old).length} finished earlier)`}<ChevronDown size={16}/></button>}
    </main>
    {open && <dialog ref={sheet} className="sheet show" aria-labelledby="sheetTitle" onCancel={e => { e.preventDefault(); if (busy !== 'leave') close(); }} onClick={e => { if (e.target === e.currentTarget && busy !== 'leave') { const r=e.currentTarget.getBoundingClientRect(); if(e.clientY < r.top || e.clientX < r.left || e.clientX > r.right) close(); } }}><div className="grab"/><div className="sheet-h"><h2 id="sheetTitle">Apply leave</h2><button className="x" aria-label="Close" disabled={busy === 'leave'} onClick={close}><X size={18}/></button></div>
      <div className="fl"><span className="lab">Type</span><div className={`opts c${Math.min(Math.max(TYPES.length, 1), 3)}`}>{TYPES.map(t => <button key={t} className="opt" aria-pressed={type===t} onClick={() => setType(t)}><b>{label(t)}</b><span>{Number(balance?.[t] || 0)} left</span></button>)}</div></div>
      <div className="fl"><span className="lab">When</span><div className="opts c3">{['today','tomorrow','pick'].map(w => <button key={w} className="opt" aria-pressed={when===w} onClick={() => {setWhen(w); setHalf(false);}}><b>{w==='pick' ? 'Pick dates' : w==='today' ? 'Today' : 'Tomorrow'}</b><span>{w==='pick' ? 'From – to' : short(w==='today' ? today : tomorrow)}</span></button>)}</div>
      {when === 'pick' && <div className="dates show"><div className="field"><label htmlFor="leave-from">From</label><input id="leave-from" type="date" min={today} value={from} onChange={e => {setFrom(e.target.value);setHalf(false);}}/></div><div className="field"><label htmlFor="leave-to">To</label><input id="leave-to" type="date" min={from || today} value={to} onChange={e => {setTo(e.target.value);setHalf(false);}}/></div></div>}
      <div className="switch-row"><div><b>Half day</b><span>Single-day leave only</span></div><button className="sw" role="switch" aria-label="Half day" aria-checked={half} disabled={!start || start!==end} onClick={() => setHalf(!half)}/></div></div>
      <div className="fl"><label className="lab" htmlFor="leave-note">Note for your manager (required)</label><textarea id="leave-note" className="note" rows={1} required placeholder="e.g. Family function" value={note} onChange={e => setNote(e.target.value)}/></div>
      <div className="sum"><div><b>{start ? start===end ? short(start) : `${short(start)} – ${short(end)}` : 'Choose a date'}</b><span style={{display:'block'}}>{start ? `${label(type)} leave` : 'Non-working days are not counted'}</span></div><div className="n">{start ? days : '–'}<small>{days===1 ? 'day' : 'days'}</small></div></div><div className="err" role="alert">{formError || validation}</div><button className="btn primary send" disabled={!!busy || !canWrite || !start || !days || !!validation || !note.trim()} onClick={submitLeave}>{busy==='leave' ? 'Sending…' : 'Send request'}</button>
    </dialog>}
    {message && <div className="toast show" role="status"><span>{message}</span>{undo && <button disabled={!!busy} onClick={() => updateTask(undo,undo.status,true)}>Undo</button>}</div>}
  </div>;
}
