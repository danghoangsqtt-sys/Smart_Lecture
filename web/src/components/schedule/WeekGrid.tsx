import { WEEKDAY_LABELS_FULL, formatDateVN, formatTime, getWeekDays, isSameDay, isToday } from '../../lib/dateUtils';
import type { ScheduleEvent } from '../../types';

const DAY_START = 6;
const DAY_END = 22;
const TOTAL_HOURS = DAY_END - DAY_START;
const HOUR_PX = 56;

const TYPE_COLORS: Record<string, string> = {
  class: 'bg-blue-600 border-blue-800',
  meeting: 'bg-amber-600 border-amber-800',
  other: 'bg-slate-500 border-slate-700',
};

function eventOffset(iso: string): number {
  const d = new Date(iso);
  const hours = Math.min(Math.max(d.getHours() + d.getMinutes() / 60, DAY_START), DAY_END);
  return (hours - DAY_START) * HOUR_PX;
}

export default function WeekGrid({
  anchor,
  events,
  onSlotClick,
  onEventClick,
}: {
  anchor: Date;
  events: ScheduleEvent[];
  onSlotClick: (date: Date) => void;
  onEventClick: (event: ScheduleEvent) => void;
}) {
  const days = getWeekDays(anchor);
  const hours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => DAY_START + i);
  const gridHeight = TOTAL_HOURS * HOUR_PX;

  return (
    <div className="overflow-x-auto rounded-sm border border-slate-200 bg-white">
      <div className="grid min-w-[900px] grid-cols-[56px_repeat(7,1fr)]">
        <div className="border-b border-r border-slate-200" />
        {days.map((d, i) => (
          <div key={d.toISOString()} className={`border-b border-r border-slate-200 px-2 py-2 text-center last:border-r-0 ${isToday(d) ? 'bg-blue-50' : ''}`}>
            <div className="text-xs font-semibold uppercase text-slate-500">{WEEKDAY_LABELS_FULL[i]}</div>
            <div className={`text-lg font-bold ${isToday(d) ? 'text-blue-900' : 'text-slate-700'}`}>{formatDateVN(d).slice(0, 5)}</div>
          </div>
        ))}

        <div className="relative border-r border-slate-200" style={{ height: gridHeight }}>
          {hours.map((h) => (
            <div key={h} className="absolute right-1 -translate-y-2 text-xs text-slate-400" style={{ top: (h - DAY_START) * HOUR_PX }}>
              {h}:00
            </div>
          ))}
        </div>
        {days.map((d) => {
          const dayEvents = events.filter((e) => isSameDay(new Date(e.startAt), d));
          return (
            <div
              key={d.toISOString()}
              className="relative border-r border-slate-200 last:border-r-0"
              style={{ height: gridHeight }}
            >
              <button
                type="button"
                aria-label={`Tạo lịch ngày ${formatDateVN(d)}`}
                onClick={() => onSlotClick(d)}
                className="absolute inset-0"
              />
              {hours.map((h) => (
                <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-slate-100" style={{ top: (h - DAY_START) * HOUR_PX }} />
              ))}
              {dayEvents.map((ev) => {
                const top = eventOffset(ev.startAt);
                const bottom = eventOffset(ev.endAt);
                return (
                  <button
                    key={ev.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(ev);
                    }}
                    className={`absolute inset-x-1 z-10 overflow-hidden rounded-sm border-l-4 px-1.5 py-1 text-left text-[11px] leading-tight text-white shadow-sm ${TYPE_COLORS[ev.eventType] ?? TYPE_COLORS.other}`}
                    style={{ top, height: Math.max(bottom - top, 18) }}
                  >
                    <div className="truncate font-semibold">{ev.title}</div>
                    <div className="truncate opacity-90">
                      {formatTime(ev.startAt)}–{formatTime(ev.endAt)}
                      {ev.room ? ` · ${ev.room}` : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
