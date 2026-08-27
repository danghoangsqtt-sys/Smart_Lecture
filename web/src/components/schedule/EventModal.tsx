import { useState } from 'react';
import { Button, Input, Label, Modal, Select, Textarea } from '../ui';
import { WEEKDAY_LABELS, addDays, combineDateTime, formatTime, toISODate } from '../../lib/dateUtils';
import toast from '../../stores/toastStore';
import type { ScheduleEvent } from '../../types';

const DOW_JS_DAYS = [1, 2, 3, 4, 5, 6, 0];

export interface EventPayload {
  title: string;
  eventType: 'class' | 'meeting' | 'other';
  room: string;
  classId: string | null;
  startAt: string;
  endAt: string;
  note: string;
}

export interface RecurringPayload {
  title: string;
  eventType: 'class' | 'meeting' | 'other';
  room: string;
  classId: string | null;
  note: string;
  startDate: string;
  endDate: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
}

export interface EventModalInitial {
  mode: 'create' | 'edit';
  event?: ScheduleEvent;
  initialDate?: Date;
}

export default function EventModal({
  initial,
  classes,
  knownRooms,
  onClose,
  onCreate,
  onCreateRecurring,
  onUpdate,
  onDelete,
}: {
  initial: EventModalInitial;
  classes: { id: string; name: string }[];
  knownRooms: string[];
  onClose: () => void;
  onCreate: (payload: EventPayload) => Promise<void>;
  onCreateRecurring: (payload: RecurringPayload) => Promise<void>;
  onUpdate: (id: string, payload: EventPayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const isEdit = initial.mode === 'edit';
  const ev = initial.event;
  const initDate = ev ? new Date(ev.startAt) : (initial.initialDate ?? new Date());

  const [title, setTitle] = useState(ev?.title ?? '');
  const [eventType, setEventType] = useState<'class' | 'meeting' | 'other'>(ev?.eventType ?? 'class');
  const [classId, setClassId] = useState(ev?.classId ?? '');
  const [room, setRoom] = useState(ev?.room ?? '');
  const [note, setNote] = useState(ev?.note ?? '');
  const [date, setDate] = useState(() => toISODate(initDate));
  const [startTime, setStartTime] = useState(() => ev ? formatTime(ev.startAt) : '08:00');
  const [endTime, setEndTime] = useState(() => ev ? formatTime(ev.endAt) : '09:30');
  const [recurring, setRecurring] = useState(false);
  const [endDate, setEndDate] = useState(() => toISODate(addDays(initDate, 28)));
  const [selectedDays, setSelectedDays] = useState<Set<number>>(() => new Set([initDate.getDay()]));
  const [busy, setBusy] = useState(false);

  const canSubmit = title.trim().length > 0 && startTime < endTime && (!recurring || (selectedDays.size > 0 && date <= endDate));

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const resolvedClassId = classId || null;
      if (isEdit && ev) {
        await onUpdate(ev.id, {
          title,
          eventType,
          room,
          classId: resolvedClassId,
          startAt: combineDateTime(date, startTime),
          endAt: combineDateTime(date, endTime),
          note,
        });
      } else if (recurring) {
        await onCreateRecurring({
          title,
          eventType,
          room,
          classId: resolvedClassId,
          note,
          startDate: date,
          endDate,
          daysOfWeek: [...selectedDays],
          startTime,
          endTime,
        });
      } else {
        await onCreate({
          title,
          eventType,
          room,
          classId: resolvedClassId,
          startAt: combineDateTime(date, startTime),
          endAt: combineDateTime(date, endTime),
          note,
        });
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!ev || !window.confirm('Xóa sự kiện này?')) return;
    setBusy(true);
    try {
      await onDelete(ev.id);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi xóa');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Sửa sự kiện' : 'Sự kiện mới'} wide>
      <div className="space-y-3">
        <div>
          <Label>Tiêu đề *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Buổi 5 - Mạch logic" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Loại</Label>
            <Select value={eventType} onChange={(e) => setEventType(e.target.value as 'class' | 'meeting' | 'other')}>
              <option value="class">Buổi dạy</option>
              <option value="meeting">Họp / Huấn luyện</option>
              <option value="other">Khác</option>
            </Select>
          </div>
          <div>
            <Label>Lớp liên quan</Label>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">— Không gắn lớp —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Phòng</Label>
            <Input value={room} onChange={(e) => setRoom(e.target.value)} list="room-options" placeholder="VD: Phòng máy 1" />
            <datalist id="room-options">
              {knownRooms.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>{recurring ? 'Ngày bắt đầu' : 'Ngày'}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Giờ bắt đầu</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label>Giờ kết thúc</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        {!isEdit && (
          <div className="rounded-sm border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
              Lặp lại hàng tuần
            </label>
            {recurring && (
              <div className="mt-3 space-y-3">
                <div>
                  <Label>Lặp vào các ngày</Label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((label, i) => {
                      const jsDay = DOW_JS_DAYS[i];
                      const checked = selectedDays.has(jsDay);
                      return (
                        <button
                          type="button"
                          key={jsDay}
                          onClick={() =>
                            setSelectedDays((prev) => {
                              const next = new Set(prev);
                              if (next.has(jsDay)) next.delete(jsDay);
                              else next.add(jsDay);
                              return next;
                            })
                          }
                          className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${checked ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label>Đến ngày</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        )}
        <div>
          <Label>Ghi chú</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex items-center justify-between pt-2">
          <div>{isEdit && <Button variant="danger" onClick={() => void handleDelete()} disabled={busy}>Xóa</Button>}</div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
            <Button onClick={() => void submit()} disabled={busy || !canSubmit}>{recurring && !isEdit ? 'Tạo hàng loạt' : 'Lưu'}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
