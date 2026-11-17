// Finds tasks that look like good candidates for automation: the same kind of task
// given again and again, or routine work (reports, data entry, uploads, follow-ups).
// Pure code (no Deno / Supabase), so the counting is exact and it can be unit-tested.

export interface TaskRow {
  description?: string | null;
  employee_id?: string | null;
  employee_name?: string | null;
  project_name?: string | null;
  status?: string | null;
  created?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface AutomationCandidate {
  task: string;            // one real example of the task text
  times_given: number;     // how many tasks matched in the period
  people: string[];        // who did them
  weeks_seen: number;      // in how many different weeks it came up
  avg_days_open: number | null; // calendar days from start to done (includes nights/weekends), NOT work effort
  projects: string[];
  routine_words: string[]; // words that suggest routine work ("report", "upload"…)
  why: 'repeats' | 'routine_work';
}

const ROUTINE = ['report', 'update', 'entry', 'enter', 'upload', 'download', 'send', 'email', 'mail', 'backup',
  'export', 'import', 'follow', 'sheet', 'excel', 'data', 'attendance', 'timesheet', 'invoice', 'bill', 'reminder',
  'rename', 'convert', 'copy', 'format', 'checklist', 'daily', 'weekly', 'monthly', 'summary', 'list', 'log', 'print', 'scan'];
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'for', 'and', 'in', 'on', 'at', 'with', 'by', 'from', 'is', 'be',
  'please', 'pls', 'kindly', 'do', 'done', 'all', 'this', 'that', 'it', 'as', 'or', 'about', 'can', 'more', 'than']);

/** Turns "Send daily report 14/11 to Ravi!" into a key like "send daily report ravi", so near-copies group together. */
export function taskKey(text: string): string {
  return text.toLowerCase()
    .replace(/\d+(st|nd|rd|th)?/g, ' ')
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/g, ' ')
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*day\b/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/).filter(w => w.length > 1 && !STOP.has(w))
    .slice(0, 6).join(' ');
}

const weekOf = (iso: string) => {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
};

export function findAutomationCandidates(tasks: TaskRow[], nameOf: (t: TaskRow) => string, limit = 25): AutomationCandidate[] {
  const groups = new Map<string, TaskRow[]>();
  for (const t of tasks) {
    const text = (t.description || '').trim();
    if (!text) continue;
    const key = taskKey(text);
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.push(t); else groups.set(key, [t]);
  }

  const out: AutomationCandidate[] = [];
  for (const [key, rows] of groups) {
    const words = key.split(' ');
    const routine = ROUTINE.filter(r => words.some(w => w === r || w.startsWith(r)));
    const repeats = rows.length >= 3;
    if (!repeats && !(routine.length && rows.length >= 2)) continue;

    const days = rows.filter(r => r.completed_at && (r.started_at || r.created))
      .map(r => (Date.parse(r.completed_at!) - Date.parse((r.started_at || r.created)!)) / 864e5)
      .filter(d => d >= 0 && d < 60);
    out.push({
      task: (rows[rows.length - 1].description || '').trim().slice(0, 140),
      times_given: rows.length,
      people: [...new Set(rows.map(nameOf))],
      weeks_seen: new Set(rows.filter(r => r.created).map(r => weekOf(r.created!))).size,
      avg_days_open: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
      projects: [...new Set(rows.map(r => r.project_name).filter((p): p is string => !!p))],
      routine_words: routine,
      why: repeats ? 'repeats' : 'routine_work',
    });
  }
  return out.sort((a, b) => b.times_given - a.times_given || b.weeks_seen - a.weeks_seen).slice(0, limit);
}
