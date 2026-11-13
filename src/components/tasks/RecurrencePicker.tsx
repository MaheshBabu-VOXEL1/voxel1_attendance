import { RefreshCw } from 'lucide-react';
import './RecurrencePicker.css';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Repeat on/off as an icon (two circling arrows); turning it on starts with Monday. */
export function RepeatButton({ on, onToggle, disabled = false }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return <button type="button" role="checkbox" aria-checked={on} aria-label="Repeat weekly" title={on ? 'Repeats weekly' : 'Repeat weekly'}
    className={`repeat-btn${on ? ' on' : ''}`} disabled={disabled} onClick={onToggle}>
    <RefreshCw size={18} strokeWidth={2.4} aria-hidden="true" />
  </button>;
}

/** The weekdays a repeating task comes back on. */
export function RecurrenceDays({ days, onChange, disabled = false }: { days: number[]; onChange: (days: number[]) => void; disabled?: boolean }) {
  return <div className="repeat-days">
    <div className="repeat-day-list">
      {[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day}>
        <input type="checkbox" disabled={disabled} checked={days.includes(day)}
          onChange={e => onChange(e.target.checked ? [...days, day].sort() : days.filter(d => d !== day))} /> {WEEKDAYS[day]}
      </label>)}
    </div>
    <p className="repeat-note">A separate occurrence appears on each selected day. Unfinished work stays visible. Due date sets the first eligible day.</p>
  </div>;
}

export function RecurrencePicker({ days, onChange, disabled = false }: {
  days: number[]; onChange: (days: number[]) => void; disabled?: boolean;
}) {
  return <fieldset aria-label="Recurring task" disabled={disabled} className="repeat-box">
    <RepeatButton on={days.length > 0} disabled={disabled} onToggle={() => onChange(days.length ? [] : [1])} />
    {days.length > 0 && <RecurrenceDays days={days} onChange={onChange} disabled={disabled} />}
  </fieldset>;
}

export const recurrenceLabel = (days?: number[] | null) => days?.length ? `Repeats ${days.map(d => WEEKDAYS[d]).join(', ')}` : '';
