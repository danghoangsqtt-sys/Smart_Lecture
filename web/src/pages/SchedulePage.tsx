import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, PageHeader, Spinner } from '../components/ui';
import WeekGrid from '../components/schedule/WeekGrid';
import MonthGrid from '../components/schedule/MonthGrid';
import EventModal, { type EventModalInitial, type EventPayload, type RecurringPayload } from '../components/schedule/EventModal';
import { useMyClasses } from './LecturesPage';
import { MONTH_LABELS, addDays, addMonths, formatDateVN, getMonthGridDays, getWeekDays, toISODate } from '../lib/dateUtils';
import { useAuthStore } from '../stores/authStore';
import toast from '../stores/toastStore';
import type { ScheduleEvent } from '../types';

type ViewMode = 'week' | 'month';
interface ConflictInfo { teacherName: string; startAt: string; endAt: string }

function reportConflicts(conflicts: ConflictInfo[]) {
  if (conflicts.length === 0) return;
  const names = [...new Set(conflicts.map((conflict) => conflict.teacherName))];
  toast.info(`Cảnh báo: phòng trùng khung giờ với ${names.join(', ')} — sự kiện vẫn được lưu.`);
}

export default function SchedulePage() {
  const user = useAuthStore((s) => s.user);
  const classes = useMyClasses();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState(new Date());
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<EventModalInitial | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    const days = viewMode === 'week' ? getWeekDays(anchor) : getMonthGridDays(anchor);
    const rangeStart = days[0];
    const rangeEnd = addDays(days[days.length - 1], 1);
    try {
      const params = new URLSearchParams({ start: toISODate(rangeStart), end: toISODate(rangeEnd) });
      if (scope === 'all') params.set('scope', 'all');
      const res = await api<{ events: ScheduleEvent[] }>(`/schedule/events?${params.toString()}`);
      setEvents(res.events);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải lịch');
    } finally {
      setLoading(false);
    }
  }, [anchor, viewMode, scope]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const knownRooms = useMemo(
    () => [...new Set(events.flatMap((event) => event.room ? [event.room] : []))].sort(),
    [events],
  );

  function goPrev() { setAnchor((a) => (viewMode === 'week' ? addDays(a, -7) : addMonths(a, -1))); }
  function goNext() { setAnchor((a) => (viewMode === 'week' ? addDays(a, 7) : addMonths(a, 1))); }
  function goToday() { setAnchor(new Date()); }

  async function handleCreate(payload: EventPayload) {
    const res = await api<{ id: string; conflicts: ConflictInfo[] }>('/schedule/events', { method: 'POST', body: JSON.stringify(payload) });
    toast.success('Đã tạo sự kiện');
    reportConflicts(res.conflicts);
    await loadEvents();
  }

  async function handleCreateRecurring(payload: RecurringPayload) {
    const res = await api<{ createdCount: number; conflicts: ConflictInfo[] }>('/schedule/events/recurring', { method: 'POST', body: JSON.stringify(payload) });
    toast.success(`Đã tạo ${res.createdCount} buổi lặp lại`);
    reportConflicts(res.conflicts);
    await loadEvents();
  }

  async function handleUpdate(id: string, payload: EventPayload) {
    const res = await api<{ ok: boolean; conflicts: ConflictInfo[] }>(`/schedule/events/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    toast.success('Đã lưu thay đổi');
    reportConflicts(res.conflicts);
    await loadEvents();
  }

  async function handleDelete(id: string) {
    await api(`/schedule/events/${id}`, { method: 'DELETE' });
    toast.success('Đã xóa sự kiện');
    await loadEvents();
  }

  const rangeLabel = viewMode === 'week'
    ? (() => {
        const days = getWeekDays(anchor);
        return `${formatDateVN(days[0]).slice(0, 5)} – ${formatDateVN(days[6])}`;
      })()
    : `${MONTH_LABELS[anchor.getMonth()]} ${anchor.getFullYear()}`;

  return (
    <div>
      <PageHeader
        title="Lịch giảng dạy"
        subtitle="Lịch huấn luyện & lịch giảng đường"
        actions={<Button onClick={() => setModal({ mode: 'create', initialDate: anchor })}><i className="fas fa-plus" /> Sự kiện mới</Button>}
      />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex gap-1">
          <Button variant="secondary" className="!py-1.5" onClick={goPrev}><i className="fas fa-chevron-left" /></Button>
          <Button variant="secondary" className="!py-1.5" onClick={goToday}>Hôm nay</Button>
          <Button variant="secondary" className="!py-1.5" onClick={goNext}><i className="fas fa-chevron-right" /></Button>
        </div>
        <span className="text-sm font-bold text-slate-700">{rangeLabel}</span>
        <div className="ml-auto flex gap-1">
          {(['week', 'month'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${viewMode === m ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              {m === 'week' ? 'Tuần' : 'Tháng'}
            </button>
          ))}
        </div>
        {user?.role === 'admin' && (
          <div className="flex gap-1">
            {(['mine', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${scope === s ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {s === 'mine' ? 'Của tôi' : 'Tất cả GV'}
              </button>
            ))}
          </div>
        )}
      </Card>
      {loading ? (
        <Spinner />
      ) : viewMode === 'week' ? (
        <WeekGrid
          anchor={anchor}
          events={events}
          onSlotClick={(date) => setModal({ mode: 'create', initialDate: date })}
          onEventClick={(event) => setModal({ mode: 'edit', event })}
        />
      ) : (
        <MonthGrid
          anchor={anchor}
          events={events}
          onDayClick={(date) => setModal({ mode: 'create', initialDate: date })}
          onEventClick={(event) => setModal({ mode: 'edit', event })}
          onMoreClick={(date) => {
            setAnchor(date);
            setViewMode('week');
          }}
        />
      )}
      {modal && (
        <EventModal
          initial={modal}
          classes={classes}
          knownRooms={knownRooms}
          onClose={() => setModal(null)}
          onCreate={handleCreate}
          onCreateRecurring={handleCreateRecurring}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
