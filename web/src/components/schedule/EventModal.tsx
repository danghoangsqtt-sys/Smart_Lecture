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

function computeInitialFormValues(initial: EventModalInitial) {
  const ev = initial.event;
  const initDate = ev ? new Date(ev.startAt) : (initial.initialDate ?? new Date());
  return {
    title: ev?.title ?? '',
    eventType: (ev?.eventType ?? 'class') as 'class' | 'meeting' | 'other',
    classId: ev?.classId ?? '',
    room: ev?.room ?? '',
    note: ev?.note ?? '',
    date: toISODate(initDate),
    startTime: ev ? formatTime(ev.startAt) : '08:00',
    endTime: ev ? formatTime(ev.endAt) : '09:30',
    endDate: toISODate(addDays(initDate, 28)),
    selectedDays: new Set([initDate.getDay()]),
  };
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
  const initialValues = computeInitialFormValues(initial);

  const [title, setTitle] = useState(initialValues.title);
  const [eventType, setEventType] = useState(initialValues.eventType);
  const [classId, setClassId] = useState(initialValues.classId);
  const [room, setRoom] = useState(initialValues.room);
  const [note, setNote] = useState(initialValues.note);
  const [date, setDate] = useState(initialValues.date);
  const [startTime, setStartTime] = useState(initialValues.startTime);
  const [endTime, setEndTime] = useState(initialValues.endTime);
  const [recurring, setRecurring] = useState(false);
  const [endDate, setEndDate] = useState(initialValues.endDate);
  const [selectedDays, setSelectedDays] = useState(initialValues.selectedDays);
  const [busy, setBusy] = useState(false);

  const canSubmit = title.trim().length > 0 && startTime < endTime && (!recurring || (selectedDays.size > 0 && date <= endDate));

  function buildSingleEventPayload(): EventPayload {
    return {
      title,
      eventType,
      room,
      classId: classId || null,
      startAt: combineDateTime(date, startTime),
      endAt: combineDateTime(date, endTime),
      note,
    };
  }

  function buildRecurringPayload(): RecurringPayload {
    return {
      title,
      eventType,
      room,
      classId: classId || null,
      note,
      startDate: date,
      endDate,
      daysOfWeek: [...selectedDays],
      startTime,
      endTime,
    };
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      if (isEdit && ev) await onUpdate(ev.id, buildSingleEventPayload());
      else if (recurring) await onCreateRecurring(buildRecurringPayload());
      else await onCreate(buildSingleEventPayload());
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
          <RecurringToggleSection
            recurring={recurring}
            onRecurringChange={setRecurring}
            selectedDays={selectedDays}
            onToggleDay={(jsDay) =>
              setSelectedDays((prev) => {
                const next = new Set(prev);
                if (next.has(jsDay)) next.delete(jsDay);
                else next.add(jsDay);
                return next;
              })
            }
            endDate={endDate}
            onEndDateChange={setEndDate}
          />
        )}
        <div>
          <Label>Ghi chú</Label>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <ModalFooterActions
          isEdit={isEdit}
          busy={busy}
          canSubmit={canSubmit}
          submitLabel={recurring && !isEdit ? 'Tạo hàng loạt' : 'Lưu'}
          onClose={onClose}
          onDelete={() => void handleDelete()}
          onSubmit={() => void submit()}
        />
      </div>
    </Modal>
  );
}

function ModalFooterActions({
  isEdit,
  busy,
  canSubmit,
  submitLabel,
  onClose,
  onDelete,
  onSubmit,
}: {
  isEdit: boolean;
  busy: boolean;
  canSubmit: boolean;
  submitLabel: string;
  onClose: () => void;
  onDelete: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <div>{isEdit && <Button variant="danger" onClick={onDelete} disabled={busy}>Xóa</Button>}</div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
        <Button onClick={onSubmit} disabled={busy || !canSubmit}>{submitLabel}</Button>
      </div>
    </div>
  );
}

function RecurringToggleSection({
  recurring,
  onRecurringChange,
  selectedDays,
  onToggleDay,
  endDate,
  onEndDateChange,
}: {
  recurring: boolean;
  onRecurringChange: (value: boolean) => void;
  selectedDays: Set<number>;
  onToggleDay: (jsDay: number) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
}) {
  return (
    <div className="rounded-sm border border-slate-200 p-3">
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" checked={recurring} onChange={(e) => onRecurringChange(e.target.checked)} />
        Lặp lại hàng tuần
      </label>
      {recurring && (
        <RecurringDaysFields
          selectedDays={selectedDays}
          onToggleDay={onToggleDay}
          endDate={endDate}
          onEndDateChange={onEndDateChange}
        />
      )}
    </div>
  );
}

function RecurringDaysFields({
  selectedDays,
  onToggleDay,
  endDate,
  onEndDateChange,
}: {
  selectedDays: Set<number>;
  onToggleDay: (jsDay: number) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
}) {
  return (
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
                onClick={() => onToggleDay(jsDay)}
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
        <Input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
      </div>
    </div>
  );
}
