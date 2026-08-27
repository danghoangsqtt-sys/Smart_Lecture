import { WEEKDAY_LABELS, formatDateVN, formatTime, getMonthGridDays, isSameDay, isToday } from '../../lib/dateUtils';
import type { ScheduleEvent } from '../../types';

const TYPE_DOT: Record<string, string> = { class: 'bg-blue-600', meeting: 'bg-amber-600', other: 'bg-slate-500' };
const MAX_VISIBLE = 3;

export default function MonthGrid({
  anchor,
  events,
  onDayClick,
  onEventClick,
  onMoreClick,
}: {
  anchor: Date;
  events: ScheduleEvent[];
  onDayClick: (date: Date) => void;
  onEventClick: (event: ScheduleEvent) => void;
  onMoreClick: (date: Date) => void;
}) {
  const days = getMonthGridDays(anchor);
  const month = anchor.getMonth();

  return (
    <div className="overflow-hidden rounded-sm border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-xs font-semibold uppercase text-slate-500">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const dayEvents = events.filter((e) => isSameDay(new Date(e.startAt), d));
          const inMonth = d.getMonth() === month;
          return (
            <div
              key={d.toISOString()}
              className={`relative min-h-[104px] border-b border-r border-slate-100 p-1.5 last:border-r-0 ${inMonth ? '' : 'bg-slate-50/60'}`}
            >
              <button
                type="button"
                aria-label={`Tạo lịch ngày ${formatDateVN(d)}`}
                onClick={() => onDayClick(d)}
                className="absolute inset-0 hover:bg-slate-50"
              />
              <div
                className={`pointer-events-none relative z-10 mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  isToday(d) ? 'bg-blue-900 text-white' : inMonth ? 'text-slate-700' : 'text-slate-300'
                }`}
              >
                {d.getDate()}
              </div>
              <div className="relative z-10 space-y-0.5">
                {dayEvents.slice(0, MAX_VISIBLE).map((ev) => (
                  <button
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev);
                    }}
                    title={`${ev.title} · ${formatTime(ev.startAt)}–${formatTime(ev.endAt)}${ev.room ? ' · ' + ev.room : ''}`}
                    className="flex w-full items-center gap-1 truncate rounded-sm bg-white px-1 py-0.5 text-left text-[10px] text-slate-700 hover:bg-slate-100"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[ev.eventType] ?? TYPE_DOT.other}`} />
                    <span className="truncate">
                      {formatTime(ev.startAt)} {ev.title}
                    </span>
                  </button>
                ))}
                {dayEvents.length > MAX_VISIBLE && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoreClick(d);
                    }}
                    className="text-[10px] font-semibold text-blue-700 hover:underline"
                  >
                    +{dayEvents.length - MAX_VISIBLE} khác
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
