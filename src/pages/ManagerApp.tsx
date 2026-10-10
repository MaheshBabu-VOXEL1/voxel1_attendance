import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User, Employee, LeaveRequest, CustomLeaveType, Holiday, LeaveBalance, Attendance } from '../types';
import { employeeService } from '../services/employee.service';
import { hrService } from '../services/hrService';
import { assignedTaskService, AssignedTask, TaskStatus, TaskProject } from '../services/assignedTask.service';
import { calendarService, CalendarEvent } from '../services/calendar.service';
import { useAssignedTasks } from '../hooks/useAssignedTasks';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_LEAVE_TYPES } from '../constants';
import { ymd } from '../utils/attendanceSheet';
import './ManagerApp.css';
import AccountModeSwitch from '../components/AccountModeSwitch';

/* Manager app: Tasks / Leaves / Calendar, built from the voxel1-manager.html design on live data. */

type Route = 'tasks' | 'leaves' | 'attendance';
type Group = 'date' | 'person' | 'project';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const short = (s: string) => { const d = parse(s); return `${d.getDate()} ${MON[d.getMonth()]}`; };
const dshort = (s: string) => { const d = parse(s); return `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
const range = (a: string, b: string) => (a === b ? dshort(a) : `${short(a)} – ${short(b)}`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const ini = (n: string) => n.split(/\s+/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase();

const ST: Record<TaskStatus, [string, string]> = {
  NOT_STARTED: ['Not started', 'Not picked up yet'], START: ['Started', 'Picked up today'], PROGRESS: ['In progress', 'Actively working on it'],
  STUCK: ['Stuck', 'Blocked, needs help or input'], END: ['Done', 'Finished'],
};
const ST_ORDER: TaskStatus[] = ['NOT_STARTED', 'START', 'PROGRESS', 'STUCK', 'END'];

const Svg = ({ w = 16, sw = 2.2, children }: { w?: number; sw?: number; children: React.ReactNode }) =>
  <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const I = {
  user: <Svg><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>,
  userS: <Svg w={13} sw={2.4}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>,
  cal: <Svg><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>,
  calS: <Svg w={13} sw={2.4}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>,
  down: <Svg w={12} sw={3}><path d="M6 9l6 6 6-6" /></Svg>,
  check: <Svg w={14} sw={3}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>,
  cross: <Svg w={13} sw={3}><path d="M7 7l10 10M17 7L7 17" /></Svg>,
  x: <Svg w={20} sw={2.4}><path d="M6 6l12 12M18 6L6 18" /></Svg>,
  search: <Svg w={19}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>,
  warn: <Svg w={14} sw={2.4}><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5v.01" /></Svg>,
  l: <Svg w={18} sw={2.4}><path d="M15 6l-6 6 6 6" /></Svg>,
  r: <Svg w={18} sw={2.4}><path d="M9 6l6 6-6 6" /></Svg>,
  plus: <Svg sw={2.6}><path d="M12 5v14M5 12h14" /></Svg>,
  moon: <Svg w={18}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Svg>,
  out: <Svg w={18}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4" /></Svg>,
};
const SIC: Record<TaskStatus, React.ReactNode> = {
  NOT_STARTED: <svg className="sic ns" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>,
  START: <svg className="sic sd" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 2.4" /></svg>,
  PROGRESS: <svg className="sic ip" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M10 4.6a5.4 5.4 0 0 1 0 10.8z" fill="currentColor" /></svg>,
  STUCK: <svg className="sic sk" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.6" fill="currentColor" /><path d="M10 5.6v5.4" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><circle cx="10" cy="14.2" r="1.15" fill="#fff" /></svg>,
  END: <svg className="sic dn" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.6" fill="currentColor" /><path d="M6.3 10.3l2.5 2.5 4.9-5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>,
};
const NAV: [Route, string, React.ReactNode][] = [
  ['tasks', 'Tasks', <Svg w={22} sw={1.9}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></Svg>],
  ['leaves', 'Leaves', <Svg w={22} sw={1.9}><path d="M8 7V3M16 7V3" /><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8.5 14.5l2.3 2.3 4.7-4.8" /></Svg>],
  ['attendance', 'Attendance', <Svg w={22} sw={1.9}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>],
];

interface MenuItem { v: string; label: string; sub?: string; lead?: React.ReactNode; on?: boolean; muted?: boolean; sep?: boolean }
interface Pop { anchor: HTMLElement; kind: 'menu' | 'due' | 'newproj'; head?: React.ReactNode; items?: MenuItem[]; cur?: string | null; pick: (v: string) => void }

export default function ManagerApp({ user, onNavigate }: { user: User; onNavigate?: (path: string) => void }) {
  const { darkMode, setDarkModePreference } = useTheme();
  const { logout } = useAuth();
  const T0 = ymd(new Date());
  const rd = (n: number) => ymd(addDays(parse(T0), n));
  const diff = (s: string) => Math.round((parse(s).getTime() - parse(T0).getTime()) / 864e5);
  // DueSeg value for Half Day: due today, marked half_day.
  const HALF = 'half';
  const dueOf = (v: string) => v === HALF ? T0 : v;
  const dueWord = (d: string) => { if (d === HALF) return 'Half day'; const n = diff(d); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === 2 ? 'Day after' : dshort(d); };

  const [route, setRoute] = useState<Route>('tasks');
  const { tasks: allTasks, loading: tasksLoading, error: tasksError, refresh } = useAssignedTasks();
  const [employees, setEmployees] = useState<Employee[]>([]);
  // Everyone who can be given a task: all employees and managers, the signed-in manager included.
  const [people, setPeople] = useState<Employee[]>([]);
  // An account-switch member in Manager mode also decides other people's leave.
  const [coDecider, setCoDecider] = useState(false);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<CustomLeaveType[]>(DEFAULT_LEAVE_TYPES);
  const [balances, setBalances] = useState<Record<string, LeaveBalance>>({});
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [workingDays, setWorkingDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
  const [loadError, setLoadError] = useState('');
  const [attendance, setAttendance] = useState<Attendance | undefined>();
  const [attReady, setAttReady] = useState(false);
  const [officeStart, setOfficeStart] = useState('09:00');
  const [lateGrace, setLateGrace] = useState(15);
  const [dayRows, setDayRows] = useState<Attendance[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  // ---------- data ----------
  // The manager's own check-in, same source as the employee home screen.
  const loadAttendance = useCallback(async () => {
    const [active, logs] = await Promise.all([hrService.getActiveAttendance(user.id), hrService.getAttendance({ employeeId: user.id, since: T0, until: T0 })]);
    setAttendance(active || logs.filter(l => l.date === T0).sort((a, b) => (b.checkIn || '').localeCompare(a.checkIn || ''))[0]);
    setAttReady(true);
  }, [user.id, T0]);
  useEffect(() => {
    void loadAttendance().catch(() => setAttReady(true));
    const onFocus = () => { void loadAttendance().catch(() => {}); };
    window.addEventListener('focus', onFocus); return () => window.removeEventListener('focus', onFocus);
  }, [loadAttendance]);
  const loadLeaves = useCallback(async () => {
    const rows = await hrService.getLeaves();
    setLeaves(rows);
    const pendingIds = Array.from(new Set(rows.filter(l => l.status === 'PENDING_MANAGER').map(l => l.employeeId)));
    const pairs = await Promise.all(pendingIds.map(async id => [id, await hrService.getLeaveBalance(id)] as const));
    setBalances(Object.fromEntries(pairs));
  }, []);
  const loadCalendar = useCallback(async () => {
    const [hols, evs] = await Promise.all([hrService.getHolidays(), calendarService.listEvents(rd(-400), rd(400))]);
    setHolidays(hols); setEvents(evs);
  }, [T0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    Promise.all([
      employeeService.getEmployees(), hrService.getLeaveTypes().catch(() => DEFAULT_LEAVE_TYPES), hrService.getConfig().catch(() => null),
      loadLeaves(), loadCalendar(), assignedTaskService.listModeSwitcherIds().catch(() => [] as string[]),
    ]).then(([emps, types, cfg, , , switchers]) => {
      if (!alive) return;
      // Account-switch members stay assignable while they are in Manager mode.
      const sw = new Set(switchers);
      setCoDecider(sw.has(user.id));
      const byName = (a: Employee, b: Employee) => (a.name || '').localeCompare(b.name || '', 'en', { sensitivity: 'base' });
      setEmployees(emps.filter(e => (e.role === 'EMPLOYEE' || sw.has(e.id)) && e.status !== 'INACTIVE').sort(byName));
      setPeople(emps.filter(e => (e.role === 'EMPLOYEE' || e.role === 'MANAGER') && e.status !== 'INACTIVE').sort(byName));
      setLeaveTypes(types);
      if (cfg?.workingDays?.length) setWorkingDays(cfg.workingDays);
      if (cfg?.officeStartTime) setOfficeStart(cfg.officeStartTime);
      if (typeof cfg?.lateGracePeriod === 'number') setLateGrace(cfg.lateGracePeriod);
    }).catch(e => alive && setLoadError(e instanceof Error ? e.message : 'Could not load your data.'));
    const tick = () => { if (!document.hidden) { void loadLeaves().catch(() => {}); } };
    const timer = window.setInterval(tick, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, [loadLeaves, loadCalendar]);

  const empName = (id?: string | null) => people.find(e => e.id === id)?.name || '';
  // Dot colour: the person's chosen colour if set, otherwise ARC blue, MEP green, everyone else grey.
  const dot = (id?: string | null) => {
    const m = people.find(e => e.id === id);
    const d = (m?.department || '').toUpperCase();
    const c = m?.dotColour === 'blue' ? 'arc' : m?.dotColour === 'green' ? 'mep' : m?.dotColour === 'grey' ? 'grey'
      : d === 'ARC' ? 'arc' : d === 'MEP' ? 'mep' : 'grey';
    return <span className={`pdot ${c}`} aria-hidden="true" />;
  };
  const typeName = (id: string) => (leaveTypes.find(t => t.id === id)?.name || id).replace(/ Leave$/, '');
  const isWk = (d: Date) => workingDays.includes(DAYL[d.getDay()]);
  const holidayOn = (d: string) => holidays.filter(h => h.date === d);
  const onLeave = (empId: string, d: string) => leaves.some(l => l.employeeId === empId && l.status === 'APPROVED' && l.startDate <= d && l.endDate >= d);


  // ---------- toast ----------
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const say = (msg: string, undo?: () => void) => {
    setToast({ msg, undo }); window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 4000 : 2400);
  };
  const fail = (e: unknown) => say(e instanceof Error ? e.message : 'Something went wrong. Please try again.');

  // ---------- popovers ----------
  const [pop, setPop] = useState<Pop | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null);
  const openPop = (p: Pop) => { setPop(cur => (cur && cur.anchor === p.anchor ? null : p)); setPopPos(null); };
  // The date field is invisible over the calendar icon. Chrome only opens its picker when its own small
  // icon is hit, so most taps missed; open the picker on any tap instead.
  const openDatePicker = (e: React.MouseEvent<HTMLInputElement>) => {
    const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
    if (typeof el.showPicker === 'function') { try { e.preventDefault(); el.showPicker(); } catch { /* the browser opens it itself */ } }
  };

  // Focus a field when it appears without scrolling the page (which would move or close the popover).
  const focusNoScroll = useCallback((el: HTMLInputElement | null) => { el?.focus({ preventScroll: true }); }, []);
  const placePop = useCallback((p: Pop) => {
    const el = popRef.current; if (!el) return;
    const r = p.anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    // The visible area shrinks when a phone keyboard opens; keep the popover inside it.
    const vv = window.visualViewport, vTop = vv?.offsetTop ?? 0, vH = vv?.height ?? window.innerHeight;
    let top = r.bottom + 6; if (top + h > window.innerHeight - 72 && r.top - h - 6 > 8) top = r.top - h - 6;
    if (p.kind === 'newproj') top = Math.min(Math.max(top, vTop + 8), vTop + vH - h - 8);
    setPopPos({ top: Math.max(8, top), left: Math.min(Math.max(12, r.left), window.innerWidth - w - 12) });
  }, []);
  useEffect(() => { if (pop) placePop(pop); }, [pop, placePop]);
  useEffect(() => {
    if (!pop) return;
    const down = (e: PointerEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node) && !pop.anchor.contains(e.target as Node)) setPop(null); };
    // On phones the page resizes and scrolls by itself: the address bar slides in and out, and the keyboard
    // opens for a box you type in. Follow the page instead of closing; close only when the button the
    // popover belongs to scrolls out of sight, or the screen width changes (the phone was rotated).
    const typing = pop.kind === 'newproj', w0 = window.innerWidth;
    const onMove = () => {
      const r = pop.anchor.getBoundingClientRect();
      if (!typing && (window.innerWidth !== w0 || r.bottom < 0 || r.top > window.innerHeight)) { setPop(null); return; }
      placePop(pop);
    };
    const vv = window.visualViewport;
    document.addEventListener('pointerdown', down, true); window.addEventListener('scroll', onMove, { passive: true }); window.addEventListener('resize', onMove);
    vv?.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('pointerdown', down, true); window.removeEventListener('scroll', onMove); window.removeEventListener('resize', onMove);
      vv?.removeEventListener('resize', onMove);
    };
  }, [pop, placePop]);

  // ---------- sheet ----------
  const [sheet, setSheet] = useState<null | { kind: 'task'; id: string } | { kind: 'event' } | { kind: 'account' } | { kind: 'person'; id: string }>(null);
  // A phone keyboard covers the bottom of the screen without moving fixed elements; lift the sheet above it.
  const [kbLift, setKbLift] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!sheet || !vv) { setKbLift(0); return; }
    const fit = () => setKbLift(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    fit(); vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    return () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); };
  }, [sheet]);
  // Per-screen state lives here (not inside the screen functions) so it survives re-renders.
  const [cpP, setCpP] = useState('');
  const [savedProjects, setSavedProjects] = useState<TaskProject[]>([]);
  const [newProjName, setNewProjName] = useState('');
  const [newProjBusy, setNewProjBusy] = useState(false);
  const [cpWho, setCpWho] = useState('');
  const [cpDue, setCpDue] = useState('');
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [groupBy, setGroupBy] = useState<Group>('date');
  const [pfilter, setPfilter] = useState('all');
  const [searchOn, setSearchOn] = useState(false);
  const [q, setQ] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState('');
  const [calY, setCalY] = useState(() => new Date().getFullYear());
  const [calM, setCalM] = useState(() => new Date().getMonth());
  const [selDay, setSelDay] = useState(() => ymd(new Date()));
  const [attDate, setAttDate] = useState(() => ymd(new Date()));
  const [attView, setAttView] = useState<'table' | 'calendar'>('table');
  const [personRows, setPersonRows] = useState<Attendance[]>([]);
  const [personLoading, setPersonLoading] = useState(false);
  const [sheetText, setSheetText] = useState('');
  const [evK, setEvK] = useState<'ev' | 'hd'>('ev');
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState(() => ymd(new Date()));
  const [evBusy, setEvBusy] = useState(false);
  const swipe = useRef(new Map<string, { x0: number; y0: number; dx: number; on: boolean; dead: boolean; at: number }>());
  const openTask = (id: string) => { setSheetText(allTasks.find(t => t.id === id)?.description || ''); setSheet({ kind: 'task', id }); };
  const openEvent = () => { setEvK('ev'); setEvTitle(''); setEvDate(selDay); setSheet({ kind: 'event' }); };
  useEffect(() => {
    if (route !== 'attendance' || attView !== 'table') return;
    let alive = true;
    const load = () => { setDayLoading(true); hrService.getAttendance({ since: attDate, until: attDate })
      .then(rows => { if (alive) setDayRows(rows); }).catch(() => {}).finally(() => alive && setDayLoading(false)); };
    load();
    const timer = window.setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [route, attDate, attView]);
  // A person's last two weeks (sheet opened from the attendance table).
  const personId = sheet?.kind === 'person' ? sheet.id : '';
  useEffect(() => {
    if (!personId) return;
    let alive = true;
    setPersonLoading(true); setPersonRows([]);
    hrService.getAttendance({ employeeId: personId, since: ymd(addDays(new Date(), -30)), until: ymd(new Date()) })
      .then(rows => { if (alive) setPersonRows(rows); }).catch(() => {}).finally(() => alive && setPersonLoading(false));
    return () => { alive = false; };
  }, [personId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (pop) setPop(null); else setSheet(null); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [pop]);
  useEffect(() => { document.body.style.overflow = sheet ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [sheet]);

  // ---------- tasks ----------
  const tasks = allTasks;
  // Every project in the organization (saved ones, even without tasks) plus any name seen on a task.
  const projects = useMemo(() => Array.from(new Set([...savedProjects.map(p => p.name), ...tasks.map(t => t.project_name).filter((n): n is string => !!n)]))
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })), [savedProjects, tasks]);
  const loadProjects = useCallback(async () => { try { setSavedProjects(await assignedTaskService.listProjects()); } catch { /* list stays task-derived */ } }, []);
  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => { if (!cpP && projects.length) setCpP(projects[0]); }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps
  /** "+ New project": a small box to name it; the project is saved at once and picked. */
  const newProjectBox = (anchor: HTMLElement, pick: (name: string) => void) => { setNewProjName(''); openPop({ anchor, kind: 'newproj', pick }); };
  const createProject = async (pick: (name: string) => void) => {
    const name = newProjName.trim();
    if (!name || newProjBusy) return;
    setNewProjBusy(true);
    try {
      const p = await assignedTaskService.createProject(name);
      await loadProjects(); setPop(null); pick(p.name);
      say(`Project ${p.name} ready · ID ${p.project_number}`);
    } catch (e) { fail(e); } finally { setNewProjBusy(false); }
  };
  const canEdit = (t: AssignedTask) => !t.self_created && t.assigned_by === user.id;
  const taskAttribution = (t: AssignedTask) => t.self_created
    ? `Written by ${t.employee_name || empName(t.employee_id || '') || 'Employee'}`
    : `Assigned by ${t.manager_name || (t.assigned_by === user.id ? user.name : 'Manager')} → ${t.employee_id ? (t.employee_name || empName(t.employee_id)) : 'Unassigned'}`;
  const task = (id: string) => tasks.find(t => t.id === id);

  const update = async (t: AssignedTask, ch: Partial<{ who: string | null; due: string | null; s: TaskStatus; p: string; text: string }>, quiet = false) => {
    if (!canEdit(t)) {
      // A task someone else gave you: you may still update its status.
      if (t.employee_id === user.id && ch.s && Object.keys(ch).length === 1) {
        try { await assignedTaskService.setStatus(t.id, ch.s); await refresh(); if (!quiet) say(ST[ch.s][0]); } catch (e) { fail(e); }
        return;
      }
      say('Only the manager who created this task can change it'); return;
    }
    const prev = { employeeId: t.employee_id, dueDate: t.due_date ?? null, status: t.status, projectName: t.project_name || 'General', description: t.description };
    const next = {
      employeeId: 'who' in ch ? (ch.who || null) : prev.employeeId, dueDate: 'due' in ch ? (ch.due ? dueOf(ch.due) : null) : prev.dueDate,
      status: ch.s ?? prev.status, projectName: ch.p ?? prev.projectName, description: ch.text ?? prev.description,
    };
    try {
      const half = 'due' in ch ? ch.due === HALF : !!t.half_day;
      await assignedTaskService.managerUpdate(t.id, next);
      if (half !== !!t.half_day || (half && next.dueDate !== prev.dueDate)) await assignedTaskService.setHalfDay(t.id, half);
      await refresh();
      if (quiet) return;
      const msg = 'who' in ch ? (next.employeeId ? `Assigned to ${empName(next.employeeId)}` : 'Moved to backlog')
        : 'due' in ch ? (next.dueDate ? `Due ${dueWord(half ? HALF : next.dueDate)}` : 'Due date removed')
        : ch.s ? ST[ch.s][0] : ch.p ? `Moved to ${ch.p}` : 'Saved';
      say(msg, () => { void assignedTaskService.managerUpdate(t.id, prev).then(() => assignedTaskService.setHalfDay(t.id, !!t.half_day)).then(refresh).catch(fail); });
    } catch (e) { fail(e); }
  };
  const remove = async (t: AssignedTask) => {
    if (!canEdit(t)) return;
    if (!window.confirm(`Delete “${t.description}”? This cannot be undone.`)) return;
    try { await assignedTaskService.managerDelete(t.id); setSheet(null); await refresh(); say('Task deleted'); } catch (e) { fail(e); }
  };

  const menuWho = (anchor: HTMLElement, cur: string | null, pick: (v: string) => void) => openPop({
    anchor, kind: 'menu', head: <>{I.user}Assign to</>, pick,
    items: [...people.map(m => ({ v: m.id, label: m.id === user.id ? `${m.name} (me)` : m.name, lead: <span className="pav">{dot(m.id)}</span>, sub: onLeave(m.id, T0) ? 'On leave' : `${tasks.filter(t => t.employee_id === m.id && t.status !== 'END').length} open`, on: cur === m.id })),
      ...(cur ? [{ v: '', label: '', sep: true }, { v: '', label: 'Unassign', sub: 'Back to backlog', muted: true }] : [])],
  });
  const menuProject = (anchor: HTMLElement, cur: string, pick: (v: string) => void, all = false) => openPop({
    anchor, kind: 'menu', head: 'Project', pick,
    items: [...(all ? [{ v: 'all', label: 'All projects', on: cur === 'all' }, { v: '', label: '', sep: true }] : []),
      ...projects.map(p => ({ v: p, label: p, sub: `${tasks.filter(t => t.project_name === p && t.status !== 'END').length} open`, on: cur === p })),
      ...(all ? [] : [...(projects.length ? [{ v: '', label: '', sep: true }] : []), { v: '__new__', label: '+ New project', sub: projects.length ? '' : 'No projects yet', lead: <span className="pav">{I.plus}</span> }])],
  });
  const menuStatus = (anchor: HTMLElement, cur: TaskStatus, pick: (v: string) => void) => openPop({
    anchor, kind: 'menu', head: 'Status', pick, items: ST_ORDER.map(k => ({ v: k, label: ST[k][0], lead: SIC[k], sub: ST[k][1], on: cur === k })),
  });
  const dueBar = (anchor: HTMLElement, cur: string | null, pick: (v: string) => void) => openPop({ anchor, kind: 'due', cur, pick });

  // ---------- render ----------
  const pendingLeaves = leaves.filter(l => l.status === 'PENDING_MANAGER' && (l.lineManagerId === user.id || user.role === 'ADMIN' || (coDecider && l.employeeId !== user.id)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return <div className="mgr" data-theme={darkMode ? 'dark' : 'light'}>
    <header className="bar"><div className="bar-in">
      <div className="brand"><img alt="" src="/img/employee-day-mark.png" /><b>VOXEL1</b><AccountModeSwitch user={user} /></div>
      <button className="avatar" aria-label="Account" onClick={() => setSheet({ kind: 'account' })}>{ini(user.name || 'Manager')}</button>
    </div></header>
    <main>
      {loadError && <p className="alert" role="alert">{loadError}</p>}
      {AttendanceCard()}
      {route === 'tasks' && TasksView()}
      {route === 'leaves' && LeavesView()}
      {route === 'attendance' && AttendanceView()}
    </main>
    <nav className="nav" aria-label="Main"><div className="nav-in">
      {NAV.map(([id, label, icon]) => <button key={id} aria-current={route === id ? 'page' : undefined} onClick={() => { setRoute(id); setPop(null); window.scrollTo(0, 0); }}>
        {icon}{label}{id === 'leaves' && pendingLeaves.length > 0 && <span className="nb">{pendingLeaves.length}</span>}
      </button>)}
    </div></nav>

    {pop && <div ref={popRef} className={`pop${pop.kind === 'due' ? ' bar' : ''}`} role={pop.kind === 'menu' ? 'listbox' : undefined}
      style={popPos ? { top: popPos.top, left: popPos.left } : { top: -9999, left: -9999 }}>
      {pop.kind === 'menu' ? <>
        {pop.head && <div className="phd">{pop.head}</div>}
        {pop.items!.map((it, i) => it.sep ? <div key={i} className="psep" /> :
          <button key={i} type="button" className={`pi${it.on ? ' on' : ''}${it.muted ? ' mu' : ''}`} role="option" aria-selected={!!it.on}
            onClick={() => { const p = pop.pick; setPop(null); p(it.v); }}>
            {it.lead}<span className="pl">{it.label}</span><small>{it.sub || ''}</small>{it.on && <span className="ck">{I.check}</span>}
          </button>)}
      </> : pop.kind === 'newproj' ? <form className="np" onSubmit={e => { e.preventDefault(); void createProject(pop.pick); }}>
        <div className="phd">New project</div>
        <label className="vh" htmlFor="npName">Project name</label>
        <input id="npName" ref={focusNoScroll} className="inp" placeholder="Project name" maxLength={200} autoComplete="off" enterKeyHint="done" value={newProjName} onChange={e => setNewProjName(e.target.value)} />
        <div className="np-a"><button type="button" className="btn" onClick={() => setPop(null)}>Cancel</button>
          <button type="submit" className="btn pri" disabled={!newProjName.trim() || newProjBusy}>{newProjBusy ? 'Creating…' : 'Create'}</button></div>
      </form> : DueSeg(pop.cur ?? null, v => { const p = pop.pick; setPop(null); p(v); }, !!pop.cur)}
    </div>}

    <div className={`scrim${sheet ? ' show' : ''}`} onClick={() => setSheet(null)} />
    <div className={`sheet${sheet ? ' show' : ''}`} role="dialog" aria-modal="true" aria-labelledby="sheetT" aria-hidden={!sheet}
      style={kbLift ? { bottom: kbLift, maxHeight: `calc(100% - ${kbLift + 12}px)` } : undefined}>
      {sheet?.kind === 'task' && TaskSheet(sheet.id)}
      {sheet?.kind === 'event' && EventSheet()}
      {sheet?.kind === 'account' && AccountSheet()}
      {sheet?.kind === 'person' && PersonSheet(sheet.id)}
    </div>
    <div className={`toast${toast ? ' show' : ''}`} role="status"><span>{toast?.msg}</span>
      {toast?.undo && <button onClick={() => { const u = toast.undo!; setToast(null); u(); }}>Undo</button>}</div>
  </div>;

  // ================= views (closures over the state above) =================
  function DueSeg(cur: string | null, onPick: (v: string) => void, clearable = false) {
    const opts: [string, string][] = [['Half Day', HALF], ['Today', T0], ['Tomorrow', rd(1)]];
    const custom = !!cur && !opts.some(o => o[1] === cur);
    return <div className="dseg" role="group" aria-label="Due date">
      {opts.map(([l, v]) => <button key={l} type="button" aria-pressed={cur === v} onClick={() => onPick(cur === v ? '' : v)}>{l}</button>)}
      <label aria-pressed={custom} title="Pick a date">{custom ? short(cur!) : I.cal}
        <input type="date" aria-label="Pick a due date" value={cur || ''} onChange={e => e.target.value && onPick(e.target.value)}
          onClick={openDatePicker} /></label>
      {clearable && <button type="button" className="x" aria-label="Remove due date" onClick={() => onPick('')}>{I.cross}</button>}
    </div>;
  }

  function TasksView() {
    const inF = (t: AssignedTask) => (pfilter === 'all' || t.project_name === pfilter)
      && (!q || `${t.description} ${t.project_name || ''} ${t.employee_name || ''} ${t.manager_name || ''}`.toLowerCase().includes(q.toLowerCase()));
    const open = tasks.filter(t => t.status !== 'END' && inF(t));
    const done = tasks.filter(t => t.status === 'END' && inF(t));
    const over = open.filter(t => t.due_date && t.due_date < T0).length, stuck = open.filter(t => t.status === 'STUCK').length;
    const byDue = (a: AssignedTask, b: AssignedTask) => (a.due_date || '9').localeCompare(b.due_date || '9') || b.created.localeCompare(a.created);

    const add = async () => {
      const items = text.split(';').map(x => x.trim()).filter(Boolean);
      const project = cpP.trim();
      if (!items.length || adding) return;
      if (!project) { say('Choose a project first, or create one with + New project'); return; }
      setAdding(true);
      try {
        const created: AssignedTask[] = [];
        const due = dueOf(cpDue);
        for (const d of items) {
          const c = cpWho ? await assignedTaskService.assign(cpWho, d, project, due, 'NOT_STARTED') : await assignedTaskService.createUnassigned(d, project, due);
          created.push(c);
          if (cpDue === HALF) await assignedTaskService.setHalfDay(c.id, true);
        }
        const msg = `${items.length > 1 ? `${items.length} tasks added` : 'Added'} · ${project}${cpWho ? ` · ${empName(cpWho)}` : ''}${cpDue ? ` · ${dueWord(cpDue)}` : ''}`;
        setText(''); setCpWho(''); setCpDue('');
        await Promise.all([refresh(), loadProjects()]);
        say(msg, () => { void Promise.all(created.map(c => assignedTaskService.managerDelete(c.id))).then(refresh).catch(fail); });
      } catch (e) { fail(e); } finally { setAdding(false); }
    };

    type G = { t: string; l: AssignedTask[]; cls?: string; hide?: string; note?: string; keep?: boolean; who?: string };
    const groups: G[] = [];
    if (groupBy === 'date') {
      ([['Overdue', (t: AssignedTask) => !!t.due_date && t.due_date < T0, 'over', ''], ['Today', (t: AssignedTask) => t.due_date === T0, '', 'due'],
        ['Tomorrow', (t: AssignedTask) => t.due_date === rd(1), '', 'due'], ['Later', (t: AssignedTask) => !!t.due_date && t.due_date > rd(1), '', ''],
        ['No due date', (t: AssignedTask) => !t.due_date, '', 'due']] as [string, (t: AssignedTask) => boolean, string, string][])
        .forEach(([t, f, cls, hide]) => groups.push({ t, l: open.filter(f).sort(byDue), cls, hide }));
    } else if (groupBy === 'person') {
      people.forEach(m => { const l = open.filter(t => t.employee_id === m.id).sort(byDue); if (l.length || onLeave(m.id, T0)) groups.push({ t: m.name, l, hide: 'who', keep: true, who: m.id, note: onLeave(m.id, T0) ? 'On leave today' : undefined }); });
      groups.push({ t: 'Unassigned', l: open.filter(t => !t.employee_id).sort(byDue), hide: 'who' });
    } else {
      projects.filter(p => pfilter === 'all' || p === pfilter).forEach(p => groups.push({ t: p, l: open.filter(t => t.project_name === p).sort(byDue), hide: 'p' }));
      const none = open.filter(t => !t.project_name); if (none.length) groups.push({ t: 'No project', l: none, hide: 'p' });
    }
    const shown = groups.filter(g => g.l.length || g.keep);

    return <>
      <div className="ph"><div><h1>Tasks</h1><p>{plural(open.length, 'open task')}
        {over > 0 && <> · <span style={{ color: 'var(--warn)', fontWeight: 600 }}>{over} overdue</span></>}
        {stuck > 0 && <> · <span style={{ color: 'var(--bad)', fontWeight: 600 }}>{stuck} stuck</span></>}</p></div></div>
      {tasksError && <p className="alert" role="alert">{tasksError}</p>}
      <div className="card comp">
        <div className="c1">
          <button type="button" className="pj" aria-haspopup="listbox" aria-label={`Project: ${cpP || 'choose'}`}
            onClick={e => { const a = e.currentTarget; menuProject(a, cpP, v => { if (v === '__new__') newProjectBox(a, n => setCpP(n)); else setCpP(v); }); }}>
            <span>{cpP || 'Project'}</span>{I.down}</button>
          <label className="vh" htmlFor="addT">New task</label>
          <input id="addT" placeholder="Add a task…" enterKeyHint="done" autoComplete="off" value={text} maxLength={4000}
            onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }} />
          <button type="button" className="btn pri" disabled={!text.trim() || adding} onClick={() => void add()}>{adding ? 'Adding…' : 'Add'}</button>
        </div>
        <div className="c2">
          <button type="button" className={`chipbtn${cpWho ? ' set' : ''}`} aria-haspopup="listbox" onClick={e => menuWho(e.currentTarget, cpWho || null, v => setCpWho(v))}>
            {cpWho ? dot(cpWho) : I.user}<span>{cpWho ? empName(cpWho) : 'Assign'}</span>{I.down}</button>
          {DueSeg(cpDue || null, v => setCpDue(v))}
        </div>
      </div>
      <div className="tools">
        <button type="button" className="pf" aria-haspopup="listbox" onClick={e => menuProject(e.currentTarget, pfilter, v => setPfilter(v), true)}>
          <span>{pfilter === 'all' ? 'All projects' : pfilter}</span>{I.down}</button>
        <button type="button" className="ibtn" aria-label="Search tasks" aria-pressed={searchOn} style={searchOn ? { color: 'var(--steel)', background: 'var(--tint)' } : undefined}
          onClick={() => { setSearchOn(!searchOn); if (searchOn) setQ(''); }}>{I.search}</button>
        <div className="seg" role="tablist" aria-label="Group by">
          {([['date', 'Date'], ['person', 'Person'], ['project', 'Project']] as [Group, string][]).map(([v, l]) =>
            <button key={v} role="tab" aria-selected={groupBy === v} onClick={() => setGroupBy(v)}>{l}</button>)}
        </div>
      </div>
      {searchOn && <div className="srch">{I.search}<label className="vh" htmlFor="q">Search tasks</label>
        <input id="q" type="search" placeholder="Search task, project or person" value={q} autoFocus autoComplete="off" onChange={e => setQ(e.target.value)} />
        <button className="ibtn" aria-label="Close search" style={{ width: 36, height: 36 }} onClick={() => { setSearchOn(false); setQ(''); }}>{I.cross}</button></div>}
      {tasksLoading ? <p className="loading" role="status">Loading tasks…</p> : <>
        {shown.map(g => <React.Fragment key={g.t}>
          <div className={`sec${g.cls ? ` ${g.cls}` : ''}`}><h2>{g.who && dot(g.who)}{g.t}</h2><span>{g.note || g.l.length}</span></div>
          {g.l.length > 0 && <div className="list">{g.l.map(t => <React.Fragment key={t.id}>{TaskRow(t, g.hide)}</React.Fragment>)}</div>}
        </React.Fragment>)}
        {!shown.length && <div className="card empty" style={{ marginTop: 16 }}>{q ? `No tasks match “${q}”` : `No open tasks${pfilter === 'all' ? '' : ` on ${pfilter}`}`}</div>}
        {done.length > 0 && <>
          <button className="more" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} completed ({done.length})</button>
          {showDone && <div className="list" style={{ marginTop: 6 }}>{[...done].sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '')).map(t => <React.Fragment key={t.id}>{TaskRow(t)}</React.Fragment>)}</div>}
        </>}
        <p className="hint">Tip: on a phone, swipe a task right to mark it done, or left to change its date.</p>
      </>}
    </>;
  }

  function TaskRow(t: AssignedTask, hide?: string) {
    if (!swipe.current.has(t.id)) swipe.current.set(t.id, { x0: 0, y0: 0, dx: 0, on: false, dead: false, at: 0 });
    const sw = { current: swipe.current.get(t.id)! };
    const parts = (el: HTMLElement) => ({ row: el, l: el.parentElement!.querySelector('.swbg.l') as HTMLElement, r: el.parentElement!.querySelector('.swbg.r') as HTMLElement });
    const isDone = t.status === 'END', edit = canEdit(t);
    const dueInfo = !t.due_date ? null : (!isDone && diff(t.due_date) < 0)
      ? { c: 'over', x: `${-diff(t.due_date)} ${diff(t.due_date) === -1 ? 'day' : 'days'} overdue` } : { c: diff(t.due_date) === 0 ? 'today' : '', x: dueWord(t.half_day && diff(t.due_date) === 0 ? HALF : t.due_date) };
    const doneOn = t.completed_at ? ymd(new Date(t.completed_at)) : '';
    const bits: React.ReactNode[] = [];
    if (hide !== 'p') bits.push(<span key="p" className="mp">{t.project_name || 'No project'}</span>);
    if (hide !== 'who') bits.push(<button key="w" className={`mb${t.employee_id ? '' : ' ph'}`} disabled={!edit}
      onClick={e => menuWho(e.currentTarget, t.employee_id, v => void update(t, { who: v || null }))}>{t.employee_id ? dot(t.employee_id) : I.userS}{t.employee_id ? (t.employee_name || empName(t.employee_id)) : 'Assign'}</button>);
    if (isDone) bits.push(<span key="d" className="mp" style={{ color: 'var(--ok)' }}>Done {doneOn === T0 ? 'today' : doneOn ? short(doneOn) : ''}</span>);
    else if (hide !== 'due' || dueInfo?.c === 'over' || dueInfo?.x === 'Half day') bits.push(<button key="d" className={`mb${dueInfo ? (dueInfo.c ? ` ${dueInfo.c}` : '') : ' ph'}`} disabled={!edit}
      onClick={e => dueBar(e.currentTarget, (t.half_day && t.due_date === T0 ? HALF : t.due_date ?? null), v => void update(t, { due: v || null }))}>{I.calS}{dueInfo ? dueInfo.x : 'Due date'}</button>);
    if (t.status === 'STUCK') bits.push(<span key="s" className="mp sk">Stuck</span>);
    if (t.self_created) bits.push(<span key="o" className="ro">Written by employee</span>);

    const ts = (e: React.TouchEvent) => { Object.assign(sw.current, { x0: e.touches[0].clientX, y0: e.touches[0].clientY, dx: 0, on: false, dead: !edit }); };
    const tm = (e: React.TouchEvent<HTMLDivElement>) => {
      const s = sw.current; if (s.dead) return; const p = parts(e.currentTarget);
      const mx = e.touches[0].clientX - s.x0, my = e.touches[0].clientY - s.y0;
      if (!s.on) { if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { s.dead = true; return; } if (Math.abs(mx) < 10) return; s.on = true; p.row.classList.add('drag'); }
      s.dx = Math.max(-140, Math.min(140, mx)); p.row.style.transform = `translateX(${s.dx}px)`;
      p.l.style.opacity = String(s.dx > 0 ? Math.min(1, s.dx / 80) : 0); p.r.style.opacity = String(s.dx < 0 ? Math.min(1, -s.dx / 80) : 0);
    };
    const te = (e: React.TouchEvent<HTMLDivElement>) => {
      const s = sw.current; if (!s.on) return; const p = parts(e.currentTarget);
      p.row.classList.remove('drag'); p.row.style.transform = ''; p.l.style.opacity = '0'; p.r.style.opacity = '0'; s.at = Date.now(); s.on = false;
      if (s.dx > 90) void update(t, { s: isDone ? 'NOT_STARTED' : 'END' });
      else if (s.dx < -90) dueBar(p.row.querySelector('.tt') as HTMLElement, (t.half_day && t.due_date === T0 ? HALF : t.due_date ?? null), v => void update(t, { due: v || null }));
    };
    const swiped = () => Date.now() - sw.current.at < 350;
    return <div className="trw">
      <div className="swbg l" aria-hidden="true">{I.check} {isDone ? 'Reopen' : 'Done'}</div>
      <div className="swbg r" aria-hidden="true">Date {I.cal}</div>
      <div className={`tr${isDone ? ' done' : ''}`} onTouchStart={ts} onTouchMove={tm} onTouchEnd={te}>
        <button className="si" disabled={!edit && t.employee_id !== user.id} aria-label={`Status: ${ST[t.status][0]}. Change status`}
          onClick={e => { if (!swiped()) menuStatus(e.currentTarget, t.status, v => void update(t, { s: v as TaskStatus })); }}>{SIC[t.status]}</button>
        <div className="tc">
          <button className="tt" onClick={() => { if (!swiped()) openTask(t.id); }}>{t.description}</button>
          <p className="task-attribution">{taskAttribution(t)}</p>
          <div className="mt">{bits.map((b, i) => <React.Fragment key={i}>{i > 0 && <span className="sep" aria-hidden="true">·</span>}{b}</React.Fragment>)}</div>
        </div>
      </div>
    </div>;
  }

  function TaskSheet(id: string) {
    const t = task(id);
    if (!t) return null;
    const text = sheetText, setText = setSheetText;
    const fit = (ta: HTMLTextAreaElement | null) => { if (ta) { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; } };
    const edit = canEdit(t);
    const saveText = () => { const v = text.replace(/\n/g, ' ').trim(); if (v && v !== t.description) void update(t, { text: v }, true); };
    return <>
      <div className="grab" /><div className="sh"><h2 id="sheetT">Task</h2><button className="ibtn" aria-label="Close" onClick={() => { saveText(); setSheet(null); }}>{I.x}</button></div>
      <p className="task-attribution">{taskAttribution(t)}</p>
      <label className="vh" htmlFor="eT">Task</label>
      <textarea ref={fit} className="ttl-in" id="eT" rows={2} value={text} readOnly={!edit} maxLength={4000}
        onChange={e => setText(e.target.value)} onBlur={saveText} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }} />
      {!edit && <p className="small">{t.self_created ? 'Written by the employee. Only they can change it.' : 'Created by another manager. Only they can change it.'}</p>}
      <div className="fields">
        <div className="f"><span>Status</span><button className="fv" disabled={!edit && t.employee_id !== user.id} aria-haspopup="listbox" onClick={e => menuStatus(e.currentTarget, t.status, v => void update(t, { s: v as TaskStatus }))}>{SIC[t.status]}<span>{ST[t.status][0]}</span>{I.down}</button></div>
        <div className="f"><span>Assigned to</span><button className="fv" disabled={!edit} aria-haspopup="listbox" onClick={e => menuWho(e.currentTarget, t.employee_id, v => void update(t, { who: v || null }))}>{t.employee_id ? dot(t.employee_id) : I.user}<span>{t.employee_id ? (t.employee_name || empName(t.employee_id)) : 'Not assigned'}</span>{I.down}</button></div>
        <div className="f"><span>Project</span><button className="fv" disabled={!edit} aria-haspopup="listbox" onClick={e => { const a = e.currentTarget; menuProject(a, t.project_name || '', v => { if (v !== '__new__') void update(t, { p: v }); else newProjectBox(a, n => void update(t, { p: n })); }); }}><span>{t.project_name || 'No project'}</span>{I.down}</button></div>
        <div className="f col"><span>Due date{t.due_date ? ` · ${dshort(t.due_date)}` : ''}</span>
          {edit ? DueSeg((t.half_day && t.due_date === T0 ? HALF : t.due_date ?? null), v => void update(t, { due: v || null }), !!t.due_date) : <span>{t.due_date ? dshort(t.due_date) : 'No due date'}</span>}</div>
      </div>
      <div className="sfoot">{edit ? <button className="btn danger" onClick={() => void remove(t)}>Delete task</button> : <span />}
        <button className="btn pri" onClick={() => { saveText(); setSheet(null); }}>Done</button></div>
    </>;
  }

  function LeavesView() {
    const busy = leaveBusy, setBusy = setLeaveBusy;
    const off = leaves.filter(l => l.status === 'APPROVED' && l.startDate <= T0 && l.endDate >= T0);
    const recent = leaves.filter(l => (l.status === 'APPROVED' || l.status === 'REJECTED') && l.endDate >= rd(-14)).sort((a, b) => b.startDate.localeCompare(a.startDate));
    const decide = async (l: LeaveRequest, status: 'APPROVED' | 'REJECTED') => {
      setBusy(l.id);
      try {
        await hrService.updateLeaveStatus(l.id, status, '', 'MANAGER');
        const due = tasks.filter(t => t.employee_id === l.employeeId && t.status !== 'END' && t.due_date && t.due_date >= l.startDate && t.due_date <= l.endDate).length;
        await loadLeaves();
        say(`${l.employeeName} · ${status === 'APPROVED' ? 'approved' : 'rejected'}${status === 'APPROVED' && due ? ` · ${plural(due, 'task')} due while away` : ''}`);
      } catch (e) { fail(e); } finally { setBusy(''); }
    };
    return <>
      <div className="ph"><div><h1>Leaves</h1><p>{pendingLeaves.length ? `${plural(pendingLeaves.length, 'request')} waiting for you` : 'All caught up'}</p></div></div>
      {off.length > 0 && <><div className="sec" style={{ marginTop: 0 }}><h2>Off today</h2></div>
        <div className="off">{off.map(l => <div key={l.id}><span className="av sm">{ini(l.employeeName)}</span>{l.employeeName} <small>{typeName(l.type)}</small></div>)}</div></>}
      <div className="sec"><h2>Waiting for you</h2><span>{pendingLeaves.length || ''}</span></div>
      <div className="list">{pendingLeaves.length ? pendingLeaves.map(l => {
        const days = l.totalDays || 0;
        const hasBal = leaveTypes.find(t => t.id === l.type)?.hasBalance ?? false;
        const bal = hasBal ? Number(balances[l.employeeId]?.[l.type] ?? 0) : null;
        const others = leaves.filter(o => o.id !== l.id && o.employeeId !== l.employeeId && o.status !== 'REJECTED' && o.startDate <= l.endDate && o.endDate >= l.startDate);
        const due = tasks.filter(t => t.employee_id === l.employeeId && t.status !== 'END' && t.due_date && t.due_date >= l.startDate && t.due_date <= l.endDate);
        const fl: [string, string][] = others.map(o => ['', `Also off: ${o.employeeName} (${range(o.startDate, o.endDate)}${o.status.startsWith('PENDING') ? ', pending' : ''})`]);
        if (due.length) fl.push(['', `${plural(due.length, 'task')} due while away: ${due.map(t => t.description).join('; ')}`]);
        if (bal !== null && days > bal) fl.push(['bad', `Only ${bal} ${typeName(l.type).toLowerCase()} days left`]);
        if (!fl.length) fl.push(['ok', 'No clashes with leave or deadlines']);
        return <div className="lv" key={l.id}>
          <div className="lh"><span className="av">{ini(l.employeeName)}</span><div className="t"><b>{l.employeeName}</b><span className="d">{range(l.startDate, l.endDate)} · {days} {days === 1 ? 'day' : 'days'}</span></div><span className="tag">{typeName(l.type)}</span></div>
          {l.reason && <p className="note">“{l.reason}”</p>}
          <div className="fl">{fl.map(([c, x], i) => <div key={i} className={c}>{c === 'ok' ? I.check : I.warn}<span>{x}</span></div>)}</div>
          <div className="lb"><small>{bal !== null ? `Balance ${bal} → ${Math.max(0, bal - days)} · ` : ''}applied {l.appliedDate?.slice(0, 10) === T0 ? 'today' : l.appliedDate ? short(l.appliedDate.slice(0, 10)) : ''}</small>
            <div className="acts"><button className="btn" disabled={busy === l.id} onClick={() => void decide(l, 'REJECTED')}>Reject</button>
              <button className="btn go" disabled={busy === l.id} onClick={() => void decide(l, 'APPROVED')}>Approve</button></div></div>
        </div>;
      }) : <div className="empty">No pending requests</div>}</div>
      <div className="sec"><h2>Recent decisions</h2></div>
      <div className="list">{recent.length ? recent.map(l => <div className="rw" key={l.id}><span className="av sm">{ini(l.employeeName)}</span>
        <div className="t"><b>{l.employeeName}</b><span>{typeName(l.type)} · {range(l.startDate, l.endDate)}</span></div>
        {l.status === 'APPROVED' ? <span className="st ok">{I.check}Approved</span> : <span className="st bad">{I.cross}Rejected</span>}</div>)
        : <div className="empty">None yet</div>}</div>
    </>;
  }

  function CalendarView() {
    type Item = { k: 'hd' | 'ev' | 'lv'; t: string; sub: string; id?: string; removable?: boolean };
    const itemsOn = (d: string): Item[] => {
      const out: Item[] = [];
      holidayOn(d).forEach(h => out.push({ k: 'hd', t: h.name, sub: 'Holiday', id: h.id, removable: !h.isGovernment }));
      events.filter(e => e.event_date === d).forEach(e => out.push({ k: 'ev', t: e.title, sub: 'Event', id: e.id, removable: true }));
      if (isWk(parse(d))) leaves.filter(l => l.status === 'APPROVED' && l.startDate <= d && l.endDate >= d)
        .forEach(l => out.push({ k: 'lv', t: l.employeeName, sub: `${typeName(l.type)} leave${l.startDate !== l.endDate ? ` · ${range(l.startDate, l.endDate)}` : ''}` }));
      const o = { hd: 0, ev: 1, lv: 2 }; return out.sort((a, b) => o[a.k] - o[b.k]);
    };
    const removeItem = async (x: Item) => {
      try {
        if (x.k === 'ev') await calendarService.deleteEvent(x.id!); else await calendarService.deleteHoliday(x.id!);
        await loadCalendar(); say(`${x.t} removed`);
      } catch (e) { fail(e); }
    };
    const agRow = (x: Item, i: number) => <div className="ag" key={`${x.k}-${x.id || x.t}-${i}`}>
      <span className="bar2" style={{ background: x.k === 'lv' ? 'var(--steel)' : x.k === 'ev' ? 'var(--go)' : '#D07A1E' }} />
      {x.k === 'lv' && <span className="av sm">{ini(x.t)}</span>}
      <div className="t"><b>{x.t}</b><span>{x.sub}</span></div>
      {x.removable && <button className="btn ghost" style={{ color: 'var(--muted)', height: 36, padding: '0 10px' }} onClick={() => void removeItem(x)}>Remove</button>}
    </div>;
    const first = new Date(calY, calM, 1), offset = (first.getDay() + 6) % 7, start = addDays(first, -offset), last = new Date(calY, calM + 1, 0);
    const cells = Math.ceil((offset + last.getDate()) / 7) * 7;
    const move = (v: number) => {
      if (v === 0) { setCalY(parse(T0).getFullYear()); setCalM(parse(T0).getMonth()); setSelDay(T0); return; }
      let m = calM + v, y = calY; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } setCalM(m); setCalY(y);
    };
    const sel = itemsOn(selDay);
    const upcoming: React.ReactNode[] = []; let n = 0;
    for (let k = 1; k <= 14; k++) {
      const ds = ymd(addDays(parse(selDay), k)), its = itemsOn(ds); if (!its.length) continue; n += its.length;
      upcoming.push(<div className="agd" key={`d-${ds}`}>{dshort(ds)}</div>, ...its.map(agRow));
    }
    return <>
      <div className="card">
        <div className="ch" style={{ padding: '10px 10px 0 16px' }}><h2>{MONL[calM]} {calY}</h2>
          <div className="n"><button className="ibtn" aria-label="Add event or holiday" style={{ color: 'var(--steel)' }} onClick={openEvent}>{I.plus}</button>
            <button className="ibtn" aria-label="Previous month" onClick={() => move(-1)}>{I.l}</button>
            <button className="btn ghost" style={{ height: 36, padding: '0 10px' }} onClick={() => move(0)}>Today</button>
            <button className="ibtn" aria-label="Next month" onClick={() => move(1)}>{I.r}</button></div></div>
        <div className="grid">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div className="dow" key={i}>{d}</div>)}
          {Array.from({ length: cells }, (_, i) => {
            const d = addDays(start, i), s = ymd(d), it = itemsOn(s), kinds = new Set(it.map(x => x.k));
            const cls = `day${d.getMonth() !== calM ? ' out' : ''}${!isWk(d) ? ' we' : ''}${kinds.has('hd') ? ' hol' : ''}${s === T0 ? ' today' : ''}${s === selDay ? ' sel' : ''}`;
            return <button key={s} className={cls} aria-pressed={s === selDay} aria-label={`${DAYL[d.getDay()]} ${d.getDate()} ${MONL[d.getMonth()]}${it.length ? `, ${plural(it.length, 'item')}` : ''}`}
              onClick={() => { setSelDay(s); if (d.getMonth() !== calM) { setCalM(d.getMonth()); setCalY(d.getFullYear()); } }}>
              <span className="dn">{d.getDate()}</span><span className="dots">{(['hd', 'ev', 'lv'] as const).filter(k => kinds.has(k)).map(k => <i key={k} className={`k-${k}`} />)}</span>
            </button>;
          })}
        </div>
        <div className="legend"><span><i className="k-lv" />Leave</span><span><i className="k-ev" />Event</span><span><i className="k-hd" />Holiday</span></div>
      </div>
      <div className="sec"><h2>{selDay === T0 ? 'Today · ' : ''}{dshort(selDay)}</h2><span>{sel.length || ''}</span></div>
      <div className="list">{sel.length ? sel.map(agRow) : <div className="empty">Nothing on this day</div>}</div>
      <div className="sec"><h2>Next 2 weeks</h2><span>{n || ''}</span></div>
      <div className="list">{upcoming.length ? upcoming : <div className="empty">Nothing planned</div>}</div>
    </>;
  }

  function EventSheet() {
    const k = evK, setK = setEvK, title = evTitle, setTitle = setEvTitle, date = evDate, setDate = setEvDate, busy = evBusy, setBusy = setEvBusy;
    const go = async () => {
      setBusy(true);
      try {
        if (k === 'ev') await calendarService.addEvent(title, date); else await calendarService.addHoliday(title, date);
        await loadCalendar(); setSheet(null); say(`${title.trim()} added · ${dshort(date)}`);
      } catch (e) { fail(e); } finally { setBusy(false); }
    };
    return <>
      <div className="grab" /><div className="sh"><h2 id="sheetT">Add to calendar</h2><button className="ibtn" aria-label="Close" onClick={() => setSheet(null)}>{I.x}</button></div>
      <div className="seg" role="tablist" style={{ marginTop: 6 }}>
        <button role="tab" aria-selected={k === 'ev'} style={{ flex: 1 }} onClick={() => setK('ev')}>Event</button>
        <button role="tab" aria-selected={k === 'hd'} style={{ flex: 1 }} onClick={() => setK('hd')}>Holiday</button>
      </div>
      <label className="lab" htmlFor="evT" style={{ marginTop: 16 }}>Title</label>
      <input className="inp" id="evT" placeholder={k === 'ev' ? 'e.g. Client review' : 'e.g. Company day off'} autoComplete="off" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
      <label className="lab" htmlFor="evD" style={{ marginTop: 14 }}>Date</label>
      <input className="inp" type="date" id="evD" value={date} onChange={e => setDate(e.target.value)} />
      {k === 'hd' && <p className="small">Holidays are shared with the whole company and are not counted as working days for leave.</p>}
      <button className="btn pri lg wide" style={{ marginTop: 18 }} disabled={!title.trim() || !date || busy} onClick={() => void go()}>{busy ? 'Adding…' : 'Add to calendar'}</button>
    </>;
  }

  // ---------- attendance: Table / Calendar ----------
  function toMin(t?: string) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function hm(m: number, ampm = false) { const h = Math.floor(m / 60), mm = m % 60; return `${(h % 12) || 12}:${String(mm).padStart(2, '0')}${ampm ? (h < 12 ? ' am' : ' pm') : ''}`; }
  function dur(m: number) { return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; }
  function lateAfter() { return (toMin(officeStart) ?? 540) + lateGrace; }
  type AttDay = { k: 'done' | 'in' | 'leave' | 'absent' | 'notyet' | 'future' | 'we' | 'hol'; inM?: number; outM?: number; late?: boolean; worked?: number; short?: boolean; leaveType?: string; hol?: string };
  /** One employee on one day: first check-in, last check-out, hours across all sessions. */
  function attOf(empId: string, d: string, rows: Attendance[]): AttDay {
    const rs = rows.filter(r => r.employeeId === empId && r.date === d && r.checkIn).sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));
    if (rs.length) {
      const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
      const open = rs.some(r => !r.checkOut), inM = toMin(rs[0].checkIn)!;
      const outM = open ? undefined : Math.max(...rs.map(r => toMin(r.checkOut) ?? 0));
      const worked = rs.reduce((t, r) => { const a = toMin(r.checkIn)!, b = r.checkOut ? toMin(r.checkOut)! : d === T0 ? nowM : a; return t + Math.max(0, b - a); }, 0);
      const late = rs.some(r => r.status === 'LATE') || inM > lateAfter();
      const k = open && d === T0 ? 'in' : 'done';
      return { k, inM, outM, late, worked, short: k === 'done' && !open && worked < 480 };
    }
    const hol = holidayOn(d)[0];
    if (!isWk(parse(d))) return { k: 'we' };
    if (hol) return { k: 'hol', hol: hol.name };
    const lv = leaves.find(l => l.employeeId === empId && l.status === 'APPROVED' && l.startDate <= d && l.endDate >= d);
    if (lv) return { k: 'leave', leaveType: lv.type };
    if (d > T0) return { k: 'future' };
    return { k: d === T0 ? 'notyet' : 'absent' };
  }
  function attStatus(a: AttDay): [string, string] {
    return a.k === 'leave' ? [`${typeName(a.leaveType!)} leave`, 'mu'] : a.k === 'absent' ? ['Absent', 'bad'] : a.k === 'notyet' ? ['Not in yet', 'mu']
    : a.k === 'in' ? [a.late ? 'Late · working' : 'Working', a.late ? 'warn' : 'info'] : a.k === 'done' ? [a.late ? 'Late' : 'Present', a.late ? 'warn' : 'ok']
    : a.k === 'hol' ? ['Holiday', 'mu'] : a.k === 'we' ? ['Weekend', 'mu'] : ['Upcoming', 'mu'];
  }
  function openPerson(id: string) { setSheet({ kind: 'person', id }); }

  function AttendanceView() {
    const head = <div className="ph"><div><h1>Attendance</h1><p>{attView === 'table' ? 'Daily check-in and check-out' : 'Leave, events and holidays'}</p></div>
      <div className="seg" role="tablist" aria-label="View">
        <button role="tab" aria-selected={attView === 'table'} onClick={() => setAttView('table')}>Table</button>
        <button role="tab" aria-selected={attView === 'calendar'} onClick={() => setAttView('calendar')}>Calendar</button>
      </div></div>;
    if (attView === 'calendar') return <>{head}{CalendarView()}</>;
    const d = attDate, dt = parse(d), hol = holidayOn(d)[0];
    const shift = (n: number) => { const next = ymd(addDays(dt, n)); setAttDate(n === 0 || next > T0 ? T0 : next); };
    const nav = <div className="card ch" style={{ padding: '6px 6px 6px 14px' }}><div><h2 style={{ fontSize: 15 }}>{d === T0 ? 'Today · ' : ''}{DAY[dt.getDay()]} {dt.getDate()} {MON[dt.getMonth()]}</h2></div>
      <div className="n"><button className="ibtn" aria-label="Previous day" onClick={() => shift(-1)}>{I.l}</button>
        {d !== T0 && <button className="btn ghost" style={{ height: 36, padding: '0 8px' }} onClick={() => setAttDate(T0)}>Today</button>}
        <label className="ibtn" style={{ position: 'relative', cursor: 'pointer' }} aria-label="Pick a date">{I.cal}
          <input type="date" value={d} max={T0} onChange={e => e.target.value && setAttDate(e.target.value > T0 ? T0 : e.target.value)} onClick={openDatePicker} style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} /></label>
        <button className="ibtn" aria-label="Next day" disabled={d >= T0} style={d >= T0 ? { opacity: 0.3 } : undefined} onClick={() => shift(1)}>{I.r}</button></div></div>;
    if (!isWk(dt) || hol) return <>{head}{nav}<div className="card empty" style={{ marginTop: 12 }}>{hol ? `${hol.name} · company holiday` : 'Weekend'}. No attendance recorded.</div></>;
    const all = employees.map(e => ({ e, a: attOf(e.id, d, dayRows) }));
    const cnt = (f: (a: AttDay) => boolean) => all.filter(x => f(x.a)).length;
    const pres = cnt(a => a.k === 'done' || a.k === 'in'), late = cnt(a => !!a.late), onLv = cnt(a => a.k === 'leave'), out = cnt(a => a.k === 'absent' || a.k === 'notyet');
    return <>
      {head}{nav}
      <div className="kpis"><div><b>{pres}<small>/{employees.length}</small></b><span>Present</span></div><div><b className="w">{late}</b><span>Late</span></div>
        <div><b>{onLv}</b><span>On leave</span></div><div><b className={out ? 'b' : ''}>{out}</b><span>{d === T0 ? 'Not in' : 'Absent'}</span></div></div>
      {dayLoading && !dayRows.length ? <p className="loading" role="status">Loading attendance…</p> :
        <div className="list" style={{ marginTop: 12 }}><table className="att"><thead><tr><th>Team member</th><th className="r">In</th><th className="r">Out</th><th className="r">Hours</th></tr></thead>
          <tbody>{all.map(({ e, a }) => { const [st, cls] = attStatus(a); return <tr key={e.id} data-a="attPerson" tabIndex={0} onClick={() => openPerson(e.id)} onKeyDown={ev => ev.key === 'Enter' && openPerson(e.id)}>
            <td><div className="nm"><span className="av sm">{ini(e.name)}</span><div><b>{e.name}</b><span className={`as ${cls}`}>{st}</span></div></div></td>
            <td className={`r${a.late ? ' lt' : ''}`}>{a.inM != null ? hm(a.inM) : '—'}</td>
            <td className="r">{a.outM != null ? hm(a.outM) : a.k === 'in' ? <span className="live">In</span> : '—'}</td>
            <td className={`r${a.short ? ' lt' : ''}`}>{a.worked ? dur(a.worked) : '—'}</td></tr>; })}</tbody></table></div>}
      <p className="hint">Late = checked in after {hm(lateAfter(), true)}. Hours in amber are under 8h. Tap a person to see their last two weeks.</p>
    </>;
  }

  function PersonSheet(id: string) {
    const e = employees.find(x => x.id === id);
    if (!e) return null;
    const days: { d: string; a: AttDay }[] = [];
    for (let i = 0, cur = parse(T0); days.length < 10 && i < 31; i++, cur = addDays(cur, -1)) {
      const d = ymd(cur);
      if (isWk(cur) && !holidayOn(d).length) days.push({ d, a: attOf(id, d, personRows) });
    }
    const withHours = days.filter(x => x.a.worked), tot = withHours.reduce((t, x) => t + (x.a.worked || 0), 0), lates = days.filter(x => x.a.late).length;
    return <>
      <div className="grab" /><div className="sh"><h2 id="sheetT">{e.name}</h2><button className="ibtn" aria-label="Close" onClick={() => setSheet(null)}>{I.x}</button></div>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--muted)' }}>{e.designation || 'Employee'} · last 10 working days</p>
      <div className="kpis" style={{ marginTop: 0 }}><div><b>{withHours.length}</b><span>Days in</span></div><div><b className="w">{lates}</b><span>Late</span></div>
        <div><b>{withHours.length ? dur(Math.round(tot / withHours.length)) : '—'}</b><span>Avg hours</span></div></div>
      {personLoading ? <p className="loading" role="status">Loading…</p> :
        <div className="list" style={{ marginTop: 12 }}><table className="att"><thead><tr><th>Day</th><th className="r">In</th><th className="r">Out</th><th className="r">Hours</th></tr></thead>
          <tbody>{days.map(({ d, a }) => { const [st, cls] = attStatus(a); return <tr key={d}>
            <td><b>{dshort(d)}</b><span className={`as ${cls}`}>{st}</span></td>
            <td className={`r${a.late ? ' lt' : ''}`}>{a.inM != null ? hm(a.inM, true) : '—'}</td>
            <td className="r">{a.outM != null ? hm(a.outM, true) : '—'}</td>
            <td className={`r${a.short ? ' lt' : ''}`}>{a.worked ? dur(a.worked) : '—'}</td></tr>; })}</tbody></table></div>}
    </>;
  }

  // Managers don't check in. The card only appears to finish a check-in made
  // in Employee mode before switching to Manager.
  function AttendanceCard() {
    const active = attReady && !!attendance?.checkIn && !attendance.checkOut;
    if (!active) return null;
    return <div className="mycheck"><div className="att-l"><span className="dot" />
      <div><b>Checked in</b><span>at {attendance?.checkIn}</span></div></div>
      <button className="btn att-btn out" disabled={!onNavigate}
        onClick={() => onNavigate?.('attendance-finish')}>Check out</button></div>;
  }

  function AccountSheet() {
    return <>
      <div className="grab" /><div className="sh"><h2 id="sheetT">{user.name}</h2><button className="ibtn" aria-label="Close" onClick={() => setSheet(null)}>{I.x}</button></div>
      {user.email && <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--muted)' }}>{user.email}</p>}
      <div className="list">
        <button className="rw" style={{ width: '100%', textAlign: 'left' }} onClick={() => setDarkModePreference(darkMode ? 'light' : 'dark')}>{I.moon}
          <div className="t"><b>Dark mode</b><span>{darkMode ? 'On' : 'Off'}</span></div></button>
        <button className="rw" style={{ width: '100%', textAlign: 'left', color: 'var(--bad)' }} onClick={() => { setSheet(null); void logout(); }}>{I.out}
          <div className="t"><b>Sign out</b></div></button>
      </div>
    </>;
  }
}
