import { useEffect, useRef, useState } from 'react';
import './TaskCommentsDialog.css';

export default function DoneNoteDialog({ title, busy, error, onCancel, onSave }: {
  title: string;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSave: (note: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="done-note-dialog" aria-labelledby="doneNoteTitle"
    onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}>
    <h2 id="doneNoteTitle">Mark as done</h2>
    <p>{title}</p>
    <label htmlFor="doneNote">What did you complete?</label>
    <textarea id="doneNote" rows={3} maxLength={1000} placeholder="Add a note for the next employee"
      value={note} onChange={e => setNote(e.target.value)} />
    {error && <p className="done-note-error" role="alert">{error}</p>}
    <div className="done-note-actions">
      <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      <button type="button" disabled={busy || note.trim().length < 3} onClick={() => onSave(note.trim())}>{busy ? 'Saving…' : 'Mark done'}</button>
    </div>
  </dialog>;
}
