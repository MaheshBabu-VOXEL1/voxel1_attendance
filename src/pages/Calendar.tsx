import React, { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const Calendar: React.FC = () => {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => new Date());

  const today = new Date();
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const leadingDays = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => new Date(year, month, index + 1));

  const changeMonth = (offset: number) => {
    setVisibleMonth(new Date(year, month + offset, 1));
    setSelectedDate(null);
  };

  const goToToday = () => {
    const current = new Date();
    setVisibleMonth(new Date(current.getFullYear(), current.getMonth(), 1));
    setSelectedDate(current);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-primary-light p-2.5">
          <CalendarDays size={22} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Calendar</h1>
          <p className="text-xs font-medium text-slate-400">Browse dates without leaving the app</p>
        </div>
      </div>

      <section aria-label="Monthly calendar" className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900" aria-live="polite">
            {visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={goToToday} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary-light">
              Today
            </button>
            <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
              <ChevronLeft size={20} />
            </button>
            <button type="button" onClick={() => changeMonth(1)} aria-label="Next month" className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center sm:gap-2">
          {WEEKDAYS.map(day => (
            <div key={day} className={`pb-2 text-xs font-semibold sm:text-sm ${day === 'Sun' ? 'text-emerald-600' : 'text-slate-500'}`}>{day}</div>
          ))}
          {Array.from({ length: leadingDays }, (_, index) => (
            <div key={`empty-${index}`} aria-hidden="true" />
          ))}
          {days.map(date => {
            const isToday = sameDay(date, today);
            const isSelected = selectedDate !== null && sameDay(date, selectedDate);
            // Sundays are the weekly holiday: shown in green.
            const isSunday = date.getDay() === 0;
            return (
              <button
                key={date.getDate()}
                type="button"
                onClick={() => setSelectedDate(date)}
                aria-label={date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                aria-current={isToday ? 'date' : undefined}
                aria-pressed={isSelected}
                className={`flex min-h-12 items-start justify-center rounded-xl border pt-2 text-sm font-semibold transition-colors sm:min-h-20 sm:justify-start sm:pl-3 ${
                  isSelected
                    ? 'border-primary bg-primary text-white'
                    : isToday
                      ? 'border-primary/30 bg-primary-light text-primary'
                      : isSunday
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-slate-100'
                }`}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </section>

      {selectedDate && (
        <p className="rounded-2xl border border-slate-100 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
          Selected: <span className="font-semibold text-slate-900">{selectedDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </p>
      )}
    </div>
  );
};

export default Calendar;
