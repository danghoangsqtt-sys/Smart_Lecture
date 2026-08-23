import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Spinner } from '../components/ui';
import toast from '../stores/toastStore';

interface ClassInfo {
  id: string;
  name: string;
  subject: string;
  academicYear: string;
  archived: boolean;
  studentCount: number;
  lectureCount: number;
}

interface StudentLite {
  id: string;
  username: string;
  displayName: string;
  status: string;
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ classes: ClassInfo[] }>(`/classes/mine?includeArchived=${showArchived ? '1' : '0'}`);
      setClasses(res.classes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải lớp học');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Lớp học"
        subtitle="Quản lý các lớp bạn đảm nhiệm / tham gia"
        actions={
          <>
            <label className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-300 ring-1 ring-slate-800">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Kể cả lưu trữ
            </label>
            <Button onClick={() => setCreateOpen(true)}>Tạo lớp mới</Button>
          </>
        }
      />
      {loading ? (
        <Spinner />
      ) : classes.length === 0 ? (
        <Card><EmptyState message="Chưa có lớp nào. Tạo lớp đầu tiên để bắt đầu." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Card key={c.id} className="p-5 transition hover:ring-indigo-700/60">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-100">{c.name} {c.archived && <span className="ml-1 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-normal text-slate-300">ĐÃ LƯU TRỮ</span>}</h3>
                  <p className="mt-0.5 text-sm text-slate-400">{c.subject || 'Không phân môn'}{c.academicYear ? ` · ${c.academicYear}` : ''}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-4 text-sm text-slate-400">
                <span>👥 {c.studentCount} học viên</span>
                <span>📚 {c.lectureCount} bài giảng</span>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" className="flex-1 !py-1.5" onClick={() => setDetailId(c.id)}>Học viên</Button>
                <Button
                  variant="ghost"
                  className={`!py-1.5 ${c.archived ? 'text-emerald-400 hover:bg-emerald-950/40' : 'text-slate-400 hover:bg-slate-800'}`}
                  onClick={async () => {
                    try {
                      await api(`/classes/${c.id}/archive`, { method: 'PATCH', body: JSON.stringify({ archived: !c.archived }) });
                      toast.success(c.archived ? 'Đã khôi phục lớp' : 'Đã lưu trữ lớp');
                      await load();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Lỗi');
                    }
                  }}
                >
                  {c.archived ? 'Khôi phục' : 'Lưu trữ'}
                </Button>
                <Button
                  variant="ghost"
                  className="!py-1.5 text-red-400 hover:bg-red-950/40"
                  onClick={async () => {
                    if (!window.confirm(`Xóa lớp "${c.name}"? Toàn bộ dữ liệu liên quan sẽ mất.`)) return;
                    try {
                      await api(`/classes/${c.id}`, { method: 'DELETE' });
                      toast.success('Đã xóa lớp');
                      await load();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : 'Lỗi');
                    }
                  }}
                >
                  Xóa
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateClassModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      <ClassDetailModal classId={detailId} onClose={() => setDetailId(null)} onChanged={load} />
    </div>
  );
}

function CreateClassModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api('/classes', { method: 'POST', body: JSON.stringify({ name, subject, academicYear: year }) });
      toast.success('Đã tạo lớp');
      setName(''); setSubject(''); setYear('');
      onClose();
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tạo lớp');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Lớp học mới">
      <div className="space-y-3">
        <div><Label>Tên lớp *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Lớp A1 - Năm 2026" /></div>
        <div><Label>Môn học</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div><Label>Năm học</Label><Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026-2027" /></div>
        <div className="flex justify-end pt-2"><Button onClick={submit} disabled={busy || !name}>Tạo lớp</Button></div>
      </div>
    </Modal>
  );
}

function ClassDetailModal({ classId, onClose, onChanged }: { classId: string | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [eligible, setEligible] = useState<StudentLite[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const loadDetail = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const detail = await api<{ students: StudentLite[] }>(`/classes/${cid}`);
      setStudents(detail.students);
      const elig = await api<{ students: StudentLite[] }>(`/classes/${cid}/eligible-students`);
      setEligible(elig.students);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (classId) void loadDetail(classId);
  }, [classId, loadDetail]);

  async function addSelected() {
    if (!classId || selected.size === 0) return;
    try {
      await api(`/classes/${classId}/enroll`, { method: 'POST', body: JSON.stringify({ studentIds: [...selected] }) });
      toast.success(`Đã thêm ${selected.size} học viên`);
      setSelected(new Set());
      await loadDetail(classId);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi thêm học viên');
    }
  }

  async function removeStudent(sid: string) {
    if (!classId) return;
    try {
      await api(`/classes/${classId}/enroll/${sid}`, { method: 'DELETE' });
      await loadDetail(classId);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  return (
    <Modal open={!!classId} onClose={onClose} title="Danh sách học viên" wide>
      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <section>
            <h4 className="mb-2 text-sm font-medium text-slate-300">Đã trong lớp ({students.length})</h4>
            {students.length === 0 ? (
              <p className="text-sm text-slate-500">Chưa có học viên nào.</p>
            ) : (
              <ul className="divide-y divide-slate-800 rounded-xl ring-1 ring-slate-800">
                {students.map((s) => (
                  <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{s.displayName} <span className="ml-1 font-mono text-xs text-slate-500">{s.username}</span></span>
                    <button onClick={() => void removeStudent(s.id)} className="text-xs text-red-400 hover:text-red-300">Xóa khỏi lớp</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h4 className="mb-2 text-sm font-medium text-slate-300">Thêm từ danh sách ({eligible.length})</h4>
            {eligible.length === 0 ? (
              <p className="text-sm text-slate-500">Tất cả học viên đã ở trong lớp.</p>
            ) : (
              <>
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-xl p-2 ring-1 ring-slate-800">
                  {eligible.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-800">
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={(e) =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(s.id);
                              else next.delete(s.id);
                              return next;
                            })
                          }
                        />
                        {s.displayName} <span className="font-mono text-xs text-slate-500">{s.username}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex justify-end">
                  <Button onClick={() => void addSelected()} disabled={selected.size === 0}>Thêm {selected.size > 0 ? `(${selected.size})` : ''}</Button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
