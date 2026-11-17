// AI assistant for the Manager screen: answers questions about today's team, tasks,
// attendance and leave ("Who has no task today?", "Which tasks are stuck and why?"),
// and recommends which kinds of tasks could be automated (from the last 60 days of tasks).
//
// Read-only: it never changes data. It reads with the caller's own login, so it sees
// exactly what that manager may see. Only allowed users (public.can_use_ai_assistant:
// Kesari while testing) get an answer.
//
// Secrets (Supabase > Edge Functions > Secrets): GEMINI_API_KEY (required),
// GEMINI_MODEL (optional, default below). The key never comes from the request.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { findAutomationCandidates } from './automation.ts';

const MODEL_DEFAULT = 'gemini-3.8-flash';
const TZ = 'Asia/Kolkata';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const hhmm = (iso?: string | null) => iso
  ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
  : null;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

type Msg = { role: 'user' | 'assistant'; text: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const auth = req.headers.get('Authorization');
  if (!auth) return json(401, { error: 'Sign in again' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: allowed, error: accessErr } = await db.rpc('can_use_ai_assistant');
  if (accessErr || allowed !== true) return json(403, { error: 'The AI assistant is not switched on for your account yet.' });

  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) return json(503, { error: 'not_configured', message: 'The AI assistant is not set up yet (no Gemini key).' });

  let messages: Msg[] = [];
  try {
    const body = await req.json();
    messages = (Array.isArray(body?.messages) ? body.messages : [])
      .filter((m: Msg) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
      .slice(-12).map((m: Msg) => ({ role: m.role, text: m.text.trim().slice(0, 2000) }));
  } catch { /* empty body */ }
  if (!messages.length || messages[messages.length - 1].role !== 'user') return json(400, { error: 'Ask a question' });

  try {
    const today = ymd(new Date());
    const in14 = ymd(new Date(Date.now() + 14 * 864e5));
    const dayStart = new Date(`${today}T00:00:00+05:30`).toISOString();
    const since60 = new Date(Date.now() - 60 * 864e5).toISOString();
    const [people, openTasks, doneToday, attendance, leaves, cfgRow, recentTasks] = await Promise.all([
      db.from('profiles').select('id,name,role,status').neq('status', 'INACTIVE'),
      db.from('assigned_tasks').select('*').neq('status', 'END').limit(1500),
      db.from('assigned_tasks').select('*').eq('status', 'END').gte('completed_at', dayStart).limit(500),
      db.from('attendance').select('employee_id,check_in,check_out').eq('date', today),
      db.from('leaves').select('employee_id,employee_name,type,start_date,end_date,status')
        .lte('start_date', in14).gte('end_date', today).in('status', ['APPROVED', 'PENDING_MANAGER', 'PENDING_HR']),
      db.from('settings').select('value').eq('key', 'app_config').limit(1).maybeSingle(),
      db.from('assigned_tasks').select('description,employee_id,employee_name,project_name,status,created,started_at,completed_at')
        .gte('created', since60).order('created', { ascending: true }).limit(3000),
    ]);
    for (const r of [people, openTasks, doneToday, attendance, leaves, recentTasks]) if (r.error) throw r.error;

    let cfg: any = {};
    try { cfg = typeof cfgRow.data?.value === 'string' ? JSON.parse(cfgRow.data.value) : (cfgRow.data?.value || {}); } catch { /* defaults */ }
    const officeStart = cfg.officeStartTime || '10:00';
    const lateAfter = toMin(officeStart) + (typeof cfg.lateGracePeriod === 'number' ? cfg.lateGracePeriod : 15);

    const nameOf = new Map<string, string>((people.data || []).map((p: any) => [String(p.id), p.name || 'Unknown']));
    const employees = (people.data || []).filter((p: any) => p.role === 'EMPLOYEE');
    const who = (t: any) => (t.employee_id ? (t.employee_name || nameOf.get(String(t.employee_id)) || 'Unknown') : 'Unassigned');
    const clip = (v: unknown, n = 90) => (typeof v === 'string' ? v.slice(0, n) : v);

    const open = openTasks.data || [];
    const compact = (t: any) => {
      const od = t.due_date && t.due_date < today ? Math.round((Date.parse(today) - Date.parse(t.due_date)) / 864e5) : 0;
      const o: Record<string, unknown> = { who: who(t), task: clip(t.description), status: t.status };
      if (t.project_name) o.project = t.project_name;
      if (t.due_date) o.due = t.due_date;
      if (od > 0) o.overdue_days = od;
      if (t.half_day) o.half_day = true;
      if (t.status === 'STUCK') { o.done_percent = t.stuck_progress ?? null; o.reason = clip(t.stuck_reason, 160) || null; }
      return o;
    };

    // Answers that need counting are worked out here, in code, so they are exact. The model only phrases them.
    const att = (attendance.data || []).map((a: any) => {
      const inT = hhmm(a.check_in);
      return { name: nameOf.get(String(a.employee_id)) || 'Unknown', check_in: inT, check_out: hhmm(a.check_out),
        late: !!inT && toMin(inT) > lateAfter };
    });
    const checkedIn = new Set(att.map(a => a.name));
    const onLeave = new Set((leaves.data || []).filter((l: any) => l.status === 'APPROVED' && l.start_date <= today && l.end_date >= today)
      .map((l: any) => String(l.employee_id)));
    const hasOpen = new Set(open.map((t: any) => String(t.employee_id)));
    const doneBy: Record<string, number> = {};
    for (const t of doneToday.data || []) doneBy[who(t)] = (doneBy[who(t)] || 0) + 1;

    const context = {
      today, office_start: officeStart, late_after_time: `${String(Math.floor(lateAfter / 60)).padStart(2, '0')}:${String(lateAfter % 60).padStart(2, '0')}`,
      employees_with_no_open_task: employees.filter((p: any) => !hasOpen.has(String(p.id)) && !onLeave.has(String(p.id))).map((p: any) => p.name),
      employees_on_approved_leave_today: employees.filter((p: any) => onLeave.has(String(p.id))).map((p: any) => p.name),
      stuck_tasks: open.filter((t: any) => t.status === 'STUCK').map(compact),
      overdue_tasks: open.filter((t: any) => t.due_date && t.due_date < today).map(compact),
      late_today: att.filter(a => a.late),
      not_checked_in_today: employees.filter((p: any) => !checkedIn.has(p.name) && !onLeave.has(String(p.id))).map((p: any) => p.name),
      counts: { open_tasks: open.length, stuck: open.filter((t: any) => t.status === 'STUCK').length,
        overdue: open.filter((t: any) => t.due_date && t.due_date < today).length, done_today: (doneToday.data || []).length },
      done_today_by_person: doneBy,
      attendance_today: att,
      leave_next_14_days: (leaves.data || []).map((l: any) => ({ name: l.employee_name, type: l.type, from: l.start_date, to: l.end_date, status: l.status })),
      all_open_tasks: open.map(compact),
      // Exact, worked out in code: task kinds that repeat (3+ times) or look like routine work, last 60 days.
      automation_candidates: findAutomationCandidates(recentTasks.data || [], who),
      tasks_looked_at_for_automation: (recentTasks.data || []).length,
    };

    const system = [
      'You are the Voxel1 Daily app assistant for managers at Voxel1 (an engineering/BIM firm in Hyderabad).',
      'Answer ONLY from the JSON data below (live app data). The lists employees_with_no_open_task, stuck_tasks, overdue_tasks, late_today, not_checked_in_today and counts are already exact: copy them, never recount or filter them yourself. If the data does not contain the answer, say so. Never invent people, tasks or numbers.',
      'Be short: lead with the direct answer, then one line per person or task. Use names. Use 12-hour times (10:34 am) and dates like "13 Nov". Statuses: NOT_STARTED, START, PROGRESS, STUCK. Telling a long list: show up to 15 and say how many more.',
      'Automation: when asked which tasks could be automated (or how to save time), use automation_candidates (already exact; from tasks_looked_at_for_automation tasks in the last 60 days). For the best 3 to 7, give: the task, how often it came up (times_given, weeks_seen) and who does it, then ONE practical way to automate it at a small firm, e.g. a recurring task in this app, a Google Sheets / Excel formula or macro, an email or WhatsApp template, a scheduled report, a Power Automate / Zapier flow, a Revit/AutoCAD/Dynamo script for drawing or BIM work, or an AI tool for drafting. If avg_days_open is present you may say the task usually stays open about that many days (start to done, calendar time). It is NOT work effort: never call it hours or time saved, and never estimate hours saved. If automation_candidates is empty, say no task repeats often enough yet and suggest what to watch for. Recommendations are suggestions only.',
      'You cannot change anything; if asked to assign, edit or announce, say you can only answer and suggest, not change data.',
      'Reply in the language the manager writes in (English, Telugu or Hinglish).',
      '', 'DATA:', JSON.stringify(context),
    ].join('\n');

    const model = Deno.env.get('GEMINI_MODEL') || MODEL_DEFAULT;
    const call = (gen: Record<string, unknown>) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
        generationConfig: gen,
      }),
      signal: AbortSignal.timeout(40_000),
    });
    // Little "thinking" = much faster. If this model does not accept that setting, retry without it.
    let res = await call({ maxOutputTokens: 1300, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } });
    if (res.status === 400) res = await call({ maxOutputTokens: 1300, temperature: 0.2 });
    const out = await res.json().catch(() => null);
    if (!res.ok) {
      console.error('[ai-assistant] Gemini error', res.status, JSON.stringify(out?.error || out).slice(0, 500));
      return json(502, { error: res.status === 429 ? 'The AI is busy right now. Try again in a minute.' : 'The AI could not answer right now. Try again.' });
    }
    const reply = (out?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || '').join('').trim();
    if (!reply) return json(502, { error: 'The AI gave an empty answer. Try asking another way.' });
    return json(200, { reply, model });
  } catch (e) {
    console.error('[ai-assistant]', e instanceof Error ? e.message : e);
    return json(500, { error: 'Could not read the team data. Try again.' });
  }
});
