// AI assistant for the Manager screen: answers questions about today's team, tasks,
// attendance and leave ("Who has no task today?", "Which tasks are stuck and why?").
//
// Read-only: it never changes data. It reads with the caller's own login, so it sees
// exactly what that manager may see. Only allowed users (public.can_use_ai_assistant:
// Kesari while testing) get an answer.
//
// Secrets (Supabase > Edge Functions > Secrets): GEMINI_API_KEY (required),
// GEMINI_MODEL (optional, default below). The key never comes from the request.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const [people, tasks, attendance, leaves, cfgRow] = await Promise.all([
      db.from('profiles').select('id,name,role,status,department').neq('status', 'INACTIVE'),
      db.from('assigned_tasks').select('*').order('created', { ascending: false }).limit(800),
      db.from('attendance').select('employee_id,check_in,check_out,status').eq('date', today),
      db.from('leaves').select('employee_id,employee_name,type,start_date,end_date,total_days,status')
        .lte('start_date', in14).gte('end_date', today).in('status', ['APPROVED', 'PENDING_MANAGER', 'PENDING_HR']),
      db.from('settings').select('value').eq('key', 'app_config').limit(1).maybeSingle(),
    ]);
    for (const r of [people, tasks, attendance, leaves]) if (r.error) throw r.error;

    let cfg: any = {};
    try { cfg = typeof cfgRow.data?.value === 'string' ? JSON.parse(cfgRow.data.value) : (cfgRow.data?.value || {}); } catch { /* defaults */ }
    const officeStart = cfg.officeStartTime || '10:00';
    const lateAfter = toMin(officeStart) + (typeof cfg.lateGracePeriod === 'number' ? cfg.lateGracePeriod : 15);

    const nameOf = new Map<string, string>((people.data || []).map((p: any) => [String(p.id), p.name || 'Unknown']));
    const team = (people.data || []).filter((p: any) => p.role === 'EMPLOYEE' || p.role === 'MANAGER')
      .map((p: any) => ({ name: p.name, role: p.role, department: p.department || null }));

    // Open work plus anything finished today; older finished tasks are history the questions rarely need.
    const relevant = (tasks.data || []).filter((t: any) => t.status !== 'END' || (t.completed_at && ymd(new Date(t.completed_at)) === today));
    const taskRows = relevant.map((t: any) => {
      const overdueDays = t.status !== 'END' && t.due_date && t.due_date < today
        ? Math.round((Date.parse(today) - Date.parse(t.due_date)) / 864e5) : 0;
      return {
        task: t.description, project: t.project_name || null,
        assignee: t.employee_id ? (t.employee_name || nameOf.get(String(t.employee_id)) || 'Unknown') : 'Unassigned',
        assigned_by: t.manager_name || nameOf.get(String(t.assigned_by)) || null,
        status: t.status === 'END' ? 'DONE_TODAY' : t.status, priority: t.priority || null,
        due: t.due_date || null, overdue_days: overdueDays || undefined, half_day: t.half_day || undefined,
        stuck: t.status === 'STUCK' ? { done_percent: t.stuck_progress ?? null, reason: t.stuck_reason || null, since: t.stuck_at || null } : undefined,
        started_at: t.started_at || null, completed_at: t.completed_at || null, created: t.created,
      };
    });

    const attRows = (attendance.data || []).map((a: any) => {
      const inT = hhmm(a.check_in);
      return { name: nameOf.get(String(a.employee_id)) || 'Unknown', check_in: inT, check_out: hhmm(a.check_out),
        late: !!inT && toMin(inT) > lateAfter, still_in: !!a.check_in && !a.check_out };
    });
    const checkedIn = new Set(attRows.map(a => a.name));
    const onLeaveToday = (leaves.data || []).filter((l: any) => l.status === 'APPROVED' && l.start_date <= today && l.end_date >= today)
      .map((l: any) => l.employee_name);

    const context = {
      today, timezone: TZ, office_start: officeStart, late_after: `${String(Math.floor(lateAfter / 60)).padStart(2, '0')}:${String(lateAfter % 60).padStart(2, '0')}`,
      team, tasks: taskRows, attendance_today: attRows,
      not_checked_in_today: team.map(p => p.name).filter(n => !checkedIn.has(n) && !onLeaveToday.includes(n)),
      leave: (leaves.data || []).map((l: any) => ({ name: l.employee_name, type: l.type, from: l.start_date, to: l.end_date, days: l.total_days, status: l.status })),
    };

    const system = [
      'You are the Voxel1 Daily app assistant for managers at Voxel1 (an engineering/BIM firm in Hyderabad).',
      'Answer ONLY from the JSON data below; it is live data from the app as of now. If the data does not contain the answer, say so plainly. Never invent people, tasks or numbers.',
      'Be short and practical: lead with the direct answer, then a compact list (one line per person or task). Use people\'s names. Use 12-hour times (e.g. 10:34 am) and dates like "13 Nov".',
      'Statuses: NOT_STARTED, START (started), PROGRESS (in progress), STUCK (blocked; see stuck.done_percent and stuck.reason), DONE_TODAY. "Delayed" or "overdue" means overdue_days > 0.',
      '"No task" means a team member with no task whose status is not DONE_TODAY. Someone is late if attendance_today.late is true.',
      'You cannot change anything in the app; if asked to assign, edit or announce, explain that this version only answers questions.',
      'Reply in the language the manager writes in (English, Telugu or Hinglish/Tenglish).',
      '',
      'DATA:', JSON.stringify(context),
    ].join('\n');

    const model = Deno.env.get('GEMINI_MODEL') || MODEL_DEFAULT;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
        generationConfig: { maxOutputTokens: 2048 },
      }),
      signal: AbortSignal.timeout(45_000),
    });
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
