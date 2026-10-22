export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function RecurrencePicker({ days, onChange, disabled = false }: {
  days: number[]; onChange: (days: number[]) => void; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} style={{ padding: 12, border: '1px solid var(--line, #cbd5e1)', borderRadius: 10 }}>
    <legend>Recurring task</legend>
    <label><input type="checkbox" checked={days.length > 0} onChange={e => onChange(e.target.checked ? [1] : [])} /> Repeat weekly</label>
    {days.length > 0 && <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
        {[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day}>
          <input type="checkbox" checked={days.includes(day)} onChange={e => onChange(e.target.checked ? [...days, day].sort() : days.filter(d => d !== day))} /> {WEEKDAYS[day]}
        </label>)}
      </div>
      <p style={{ fontSize: 12, marginTop: 8 }}>A separate occurrence appears on each selected day. Unfinished work stays visible. Due date sets the first eligible day.</p>
    </>}
  </fieldset>;
}

export const recurrenceLabel = (days?: number[] | null) => days?.length ? `Repeats ${days.map(d => WEEKDAYS[d]).join(', ')}` : '';
