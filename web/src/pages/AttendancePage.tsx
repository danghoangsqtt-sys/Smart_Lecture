import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Spinner } from '../components/ui';
import toast from '../stores/toastStore';
import { useMyClasses } from './LecturesPage';

interface SessionInfo { id: string; date: string; periodsTotal: number; note: string }
interface RecordRow {
  studentId: string;
  displayName: string;
  status: string | null;
  periodsAbsent: number;
  reason: string;
}

export default function AttendancePage() {
  const classes = useMyClasses();
  const [classId, setClassId] = useState('');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (classes.length > 0 && !classId) setClassId(classes[0].id);
  }, [classes, classId]);

  const loadSessions = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const res = await api<{ sessions: SessionInfo[] }>(`/classes/${classId}/attendance/sessions`);
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
      <PageHeader
        title="Điểm danh"
        subtitle="Điểm danh theo buổi — số tiết vắng & lý do"
        actions={
          <>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Button onClick={() => setCreateOpen(true)} disabled={!classId}>+ Buổi học</Button>
          </>
        }
      />
      {!classId ? (
        <Card><EmptyState message="Chưa có lớp nào" /></Card>
      ) : loading ? (
        <Spinner />
      ) : sessions.length === 0 ? (
        <Card><EmptyState message="Chưa có buổi học nào. Tạo buổi để điểm danh." /></Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <button key={s.id} onClick={() => setOpenSession(s.id)} className="flex w-full items-center gap-4 rounded-xl bg-slate-900 px-4 py-3 text-left ring-1 ring-slate-800 transition hover:ring-indigo-700/60">
              <span className="font-mono text-lg font-semibold text-indigo-300">{new Date(s.date + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
              <span className="text-sm text-slate-400">{s.periodsTotal} tiết{s.note ? ` · ${s.note}` : ''}</span>
              <span className="ml-auto text-xs text-indigo-400">Điểm danh →</span>
            </button>
          ))}
        </div>
      )}
      <CreateSessionModal open={createOpen} classId={classId} onClose={() => setCreateOpen(false)} onCreated={loadSessions} />
      <MarkModal sessionId={openSession} onClose={() => setOpenSession(null)} onSaved={loadSessions} />
    </div>
  );
}

function CreateSessionModal({ open, classId, onClose, onCreated }: { open: boolean; classId: string; onClose: () => void; onCreated: () => Promise<void> }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [periods, setPeriods] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api(`/classes/${classId}/attendance/sessions`, { method: 'POST', body: JSON.stringify({ date, periodsTotal: periods, note }) });
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
    <Modal open={open && !!classId} onClose={onClose} title="Buổi học mới">
      <div className="space-y-3">
        <div><Label>Ngày</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label>Số tiết</Label><Input type="number" min={1} max={12} value={periods} onChange={(e) => setPeriods(Number(e.target.value))} /></div>
        <div><Label>Ghi chú</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: Bài 4 - Luyện tập" /></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy}>Tạo</Button></div>
      </div>
    </Modal>
  );
}

function MarkModal({ sessionId, onClose, onSaved }: { sessionId: string | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    api<{ session: SessionInfo; records: RecordRow[] }>(`/attendance/sessions/${sessionId}`)
      .then((r) => setRecords(r.records))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Lỗi'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  async function save() {
    if (!sessionId) return;
    setSaving(true);
    try {
      await api(`/attendance/sessions/${sessionId}/records`, {
        method: 'PUT',
        body: JSON.stringify({
          records: records.map((r) => ({ studentId: r.studentId, status: r.status ?? 'present', periodsAbsent: r.periodsAbsent, reason: r.reason })),
        }),
      });
      toast.success('Đã lưu điểm danh');
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setSaving(false);
    }
  }

  function setStatus(idx: number, status: 'present' | 'absent' | 'late') {
    setRecords((rs) => rs.map((r, i) => (i === idx ? { ...r, status, periodsAbsent: status === 'present' ? 0 : r.periodsAbsent || 1 } : r)));
  }

  return (
    <Modal open={!!sessionId} onClose={onClose} title="Điểm danh buổi học" wide>
      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-3">
          <ul className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {records.map((r, idx) => (
              <li key={r.studentId} className="rounded-xl px-3 py-2 ring-1 ring-slate-800">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-36 flex-1 text-sm">{r.displayName}</span>
                  <div className="flex gap-1">
                    {(['present', 'late', 'absent'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setStatus(idx, s)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                          r.status === s
                            ? s === 'present' ? 'bg-emerald-700 text-white' : s === 'late' ? 'bg-amber-700 text-white' : 'bg-red-700 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {s === 'present' ? 'Có mặt' : s === 'late' ? 'Muộn' : 'Vắng'}
                      </button>
                    ))}
                  </div>
                  {r.status === 'absent' && (
                    <input type="number" min={1} max={12} value={r.periodsAbsent || ''} placeholder="tiết"
                      onChange={(e) => setRecords((rs) => rs.map((x, i) => (i === idx ? { ...x, periodsAbsent: Number(e.target.value) } : x)))}
                      className="w-16 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm" />
                  )}
                </div>
                {(r.status === 'absent' || r.reason) && (
                  <input value={r.reason} placeholder="Lý do vắng…" onChange={(e) => setRecords((rs) => rs.map((x, i) => (i === idx ? { ...x, reason: e.target.value } : x)))}
                    className="mt-2 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm" />
                )}
              </li>
            ))}
          </ul>
          <div className="flex justify-end"><Button onClick={() => void save()} disabled={saving}>Lưu điểm danh</Button></div>
        </div>
      )}
    </Modal>
  );
}
