import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, Input, Label, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { toISODate } from '../../lib/dateUtils';
import { useFieldReducer } from '../../hooks/useFieldReducer';
import toast from '../../stores/toastStore';
import type { AttendanceRecordRow, AttendanceSessionInfo } from './types';

const TEACHING_TYPES = ['Lý thuyết', 'Thực hành', 'Bài tập', 'Ôn tập', 'Kiểm tra', 'Thảo luận/Xemina', 'Trực tuyến'];

export function AttendanceTab({ classId, canManage }: { classId: string; canManage: boolean }) {
  const [sessions, setSessions] = useState<AttendanceSessionInfo[]>([]);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ sessions: AttendanceSessionInfo[] }>(`/classes/${classId}/attendance/sessions`);
      setSessions(res.sessions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setCreateOpen(true)}><i className="fas fa-plus" /> Buổi học</Button>
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : sessions.length === 0 ? (
        <Card><EmptyState message="Chưa có buổi học nào." /></Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenSession(s.id)}
              className="flex w-full flex-wrap items-center gap-3 rounded-sm border border-slate-300 bg-white px-4 py-3 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <span className="font-mono text-lg font-semibold text-blue-900">
                {new Date(s.date + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
              </span>
              <span className="text-sm text-slate-500">{s.periodsTotal} tiết</span>
              {s.teachingType && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">{s.teachingType}</span>}
              {s.note && <span className="max-w-[240px] truncate text-sm text-slate-500">{s.note}</span>}
              {(s.absentCount ?? 0) > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">{s.absentCount} vắng</span>}
              <span className="ml-auto text-xs font-semibold text-blue-700">{canManage ? 'Điểm danh' : 'Xem'} <i className="fas fa-arrow-right" /></span>
            </button>
          ))}
        </div>
      )}
      {canManage && createOpen && <CreateSessionModal classId={classId} onClose={() => setCreateOpen(false)} onCreated={loadSessions} />}
      {openSession && <MarkModal sessionId={openSession} canManage={canManage} onClose={() => setOpenSession(null)} onSaved={loadSessions} />}
    </div>
  );
}

function CreateSessionModal({
  classId,
  initialTeachingPlanItemId,
  onClose,
  onCreated,
}: {
  classId: string;
  initialTeachingPlanItemId?: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const today = toISODate(new Date());
  const [date, setDate] = useState(today);
  const [periods, setPeriods] = useState(1);
  const [teachingType, setTeachingType] = useState(TEACHING_TYPES[0]!);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api(`/classes/${classId}/attendance/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          date,
          periodsTotal: periods,
          teachingType,
          note: content,
          teachingPlanItemId: initialTeachingPlanItemId ?? undefined,
        }),
      });
      toast.success('Đã tạo buổi học');
      onClose();
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Buổi học mới">
      <div className="space-y-3">
        <div><Label>Ngày</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label>Số tiết</Label><Input type="number" min={1} max={12} value={periods} onChange={(e) => setPeriods(Number(e.target.value))} /></div>
        <div>
          <Label>Loại hình giảng dạy</Label>
          <Select value={teachingType} onChange={(e) => setTeachingType(e.target.value)}>
            {TEACHING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div><Label>Nội dung giảng dạy</Label><Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="VD: Bài 4 - Luyện tập" /></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy}>Tạo</Button></div>
      </div>
    </Modal>
  );
}

function MarkModal({ sessionId, canManage, onClose, onSaved }: { sessionId: string; canManage: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [state, setField] = useFieldReducer(() => ({
    session: null as AttendanceSessionInfo | null,
    records: [] as AttendanceRecordRow[],
    teachingType: TEACHING_TYPES[0]!,
    content: '',
    remark: '',
    loading: true,
    saving: false,
  }));
  const { session, records, teachingType, content, remark, loading, saving } = state;

  useEffect(() => {
    setField('loading', true);
    api<{ session: AttendanceSessionInfo; records: AttendanceRecordRow[] }>(`/attendance/sessions/${sessionId}`)
      .then((r) => {
        setField('session', r.session);
        setField('records', r.records);
        setField('teachingType', r.session.teachingType || TEACHING_TYPES[0]!);
        setField('content', r.session.note);
        setField('remark', r.session.remark);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Lỗi'))
      .finally(() => setField('loading', false));
  }, [sessionId, setField]);

  function toggleAbsent(idx: number, absent: boolean) {
    setField('records', (rs) =>
      rs.map((r, i) =>
        i === idx
          ? { ...r, status: absent ? 'absent' : 'present', periodsAbsent: absent ? (r.periodsAbsent || session?.periodsTotal || 1) : 0, reason: absent ? r.reason : '' }
          : r
      )
    );
  }

  async function save() {
    setField('saving', true);
    try {
      await Promise.all([
        api(`/attendance/sessions/${sessionId}/records`, {
          method: 'PUT',
          body: JSON.stringify({
            records: records.map((r) => ({
              studentId: r.studentId,
              status: r.status === 'absent' ? 'absent' : 'present',
              periodsAbsent: r.status === 'absent' ? r.periodsAbsent : 0,
              reason: r.status === 'absent' ? r.reason : '',
            })),
          }),
        }),
        api(`/attendance/sessions/${sessionId}`, {
          method: 'PATCH',
          body: JSON.stringify({ teachingType, note: content, remark }),
        }),
      ]);
      toast.success('Đã lưu điểm danh');
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setField('saving', false);
    }
  }

  const total = records.length;
  const absentCount = records.filter((r) => r.status === 'absent').length;
  const presentCount = total - absentCount;

  return (
    <Modal open onClose={onClose} title={canManage ? 'Điểm danh buổi học' : 'Xem điểm danh buổi học'} wide>
      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {canManage ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Loại hình giảng dạy</Label>
                <Select value={teachingType} onChange={(e) => setField('teachingType', e.target.value)}>
                  {TEACHING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Nội dung giảng dạy</Label>
                <Textarea rows={2} value={content} onChange={(e) => setField('content', e.target.value)} placeholder="Nội dung đã giảng dạy trong buổi học…" />
              </div>
            </div>
          ) : (
            (session?.teachingType || session?.note) && (
              <div className="space-y-1 text-sm text-slate-600">
                {session?.teachingType && <p><span className="font-semibold text-slate-700">Loại hình:</span> {session.teachingType}</p>}
                {session?.note && <p><span className="font-semibold text-slate-700">Nội dung:</span> {session.note}</p>}
              </div>
            )
          )}

          <div className="flex items-center gap-4 rounded-sm border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
            <span>Sĩ số: <strong>{total}</strong></span>
            <span className="text-emerald-700">Có mặt: <strong>{presentCount}</strong></span>
            <span className="text-red-700">Vắng: <strong>{absentCount}</strong></span>
          </div>

          <ul className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
            {records.map((r, idx) => {
              const absent = r.status === 'absent';
              return (
                <li key={r.studentId} className={`rounded-sm border px-3 py-2 ${absent ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-36 flex-1 text-sm">{r.displayName}</span>
                    {canManage ? (
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-red-700">
                        <input
                          type="checkbox"
                          checked={absent}
                          onChange={(e) => toggleAbsent(idx, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-red-600"
                        />
                        Vắng
                      </label>
                    ) : (
                      <span className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${absent ? 'bg-red-100 text-red-800' : r.status === 'present' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                        {absent ? 'Vắng' : r.status === 'present' ? 'Có mặt' : 'Chưa điểm danh'}
                      </span>
                    )}
                    {canManage && absent && (
                      <input
                        aria-label={`Số tiết vắng của ${r.displayName}`}
                        type="number" min={1} max={12} value={r.periodsAbsent || ''} placeholder="tiết"
                        onChange={(e) => setField('records', (rs) => rs.map((x, i) => (i === idx ? { ...x, periodsAbsent: Number(e.target.value) } : x)))}
                        className="w-16 rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                      />
                    )}
                    {!canManage && absent && r.periodsAbsent > 0 && <span className="text-xs text-slate-500">{r.periodsAbsent} tiết</span>}
                  </div>
                  {canManage && absent && (
                    <Input
                      value={r.reason}
                      placeholder="Lý do vắng…"
                      onChange={(e) => setField('records', (rs) => rs.map((x, i) => (i === idx ? { ...x, reason: e.target.value } : x)))}
                      className="mt-2"
                    />
                  )}
                  {!canManage && absent && r.reason && <p className="mt-1.5 text-xs text-slate-500">Lý do: {r.reason}</p>}
                </li>
              );
            })}
          </ul>

          {canManage ? (
            <div>
              <Label>Nhận xét buổi học</Label>
              <Textarea rows={3} value={remark} onChange={(e) => setField('remark', e.target.value)} placeholder="Nhận xét chung về buổi học…" />
            </div>
          ) : (
            session?.remark && (
              <div className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-sm">
                <span className="font-semibold text-slate-700">Nhận xét buổi học:</span> <span className="text-slate-600">{session.remark}</span>
              </div>
            )
          )}

          {canManage && (
            <div className="flex justify-end">
              <Button onClick={() => void save()} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu điểm danh'}</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
