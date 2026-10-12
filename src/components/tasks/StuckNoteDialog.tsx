import { useEffect, useRef, useState } from 'react';
import './StuckNoteDialog.css';

/** How much is done when a task gets stuck. */
export const STUCK_STEPS = [10, 25, 50, 75, 90];

/**
 * Asks for the Stuck note before a task is marked Stuck: how much is done and why.
 * Both are required, so the manager can plan the next day.
 */
export default function StuckNoteDialog({ title, busy, error, onCancel, onSave }: {
  title: string;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (progress: number, reason: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  useEffect(() => { ref.current?.showModal?.(); }, []);
  const ready = progress !== null && reason.trim().length >= 3;
  return <dialog ref={ref} className="stuck-dlg" aria-labelledby="stuckTitle"
    onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="stuckTitle">Mark as stuck</h2>
    <p className="stuck-task">{title}</p>
    <span className="stuck-lab" id="stuckDone">How much is done?</span>
    <div className="stuck-steps" role="radiogroup" aria-labelledby="stuckDone">
      {STUCK_STEPS.map(p => <button key={p} type="button" role="radio" aria-checked={progress === p} onClick={() => setProgress(p)}>{p}%</button>)}
    </div>
    <label className="stuck-lab" htmlFor="stuckWhy">Why is it stuck?</label>
    <textarea id="stuckWhy" rows={3} maxLength={1000} required placeholder="e.g. Waiting for level 3 drawings from the client"
      value={reason} onChange={e => setReason(e.target.value)} />
    {error && <p className="stuck-err" role="alert">{error}</p>}
    <div className="stuck-acts">
      <button type="button" className="stuck-cancel" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" className="stuck-save" disabled={!ready || busy} onClick={() => progress !== null && onSave(progress, reason.trim())}>
        {busy ? 'Saving…' : 'Mark stuck'}</button>
    </div>
  </dialog>;
}
