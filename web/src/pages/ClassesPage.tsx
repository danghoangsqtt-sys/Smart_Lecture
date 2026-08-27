import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PageHeader, Spinner } from '../components/ui';
import { useAuthStore } from '../stores/authStore';
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

interface FrequentAbsenceRow {
  studentId: string;
  displayName: string;
  classId: string;
  className: string;
  absentCount: number;
  periodsAbsent: number;
}

const detailLinkClass = 'inline-flex items-center justify-center gap-2 rounded-sm border border-slate-200 bg-slate-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600 transition hover:bg-slate-200';

export default function ClassesPage() {
  const user = useAuthStore((s) => s.user);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [frequentAbsences, setFrequentAbsences] = useState<FrequentAbsenceRow[]>([]);

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

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (user?.role === 'student') return;
    api<{ rows: FrequentAbsenceRow[] }>('/attendance/frequent-absences')
      .then((res) => setFrequentAbsences(res.rows))
      .catch(() => setFrequentAbsences([]));
  }, [user]);

  return (
    <div>
      <PageHeader
        title="Lớp học"
        subtitle="Quản lý các lớp bạn đảm nhiệm / tham gia"
        actions={
          <>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Kể cả lưu trữ
              </label>
              <Button variant="secondary" onClick={() => setViewMode(v => v === 'cards' ? 'table' : 'cards')}>
                {viewMode === 'cards' ? 'Bảng' : 'Thẻ'}
              </Button>
              <Button onClick={() => setCreateOpen(true)}>Tạo lớp mới</Button>
            </div>
          </>
        }
      />

      {frequentAbsences.length > 0 && (
        <Card className="mb-4 border-l-4 border-l-amber-500 p-4">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
            <i className="fas fa-triangle-exclamation" /> Học viên nghỉ nhiều buổi
          </h4>
          <ul className="divide-y divide-slate-100">
            {frequentAbsences.map((r) => (
              <li key={`${r.studentId}-${r.classId}`} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-slate-700">{r.displayName} <span className="text-slate-400">· {r.className}</span></span>
                <Link to={`/classes/${r.classId}?tab=attendance`} className="text-xs font-semibold text-amber-700 hover:underline">
                  Vắng {r.absentCount} buổi ({r.periodsAbsent} tiết) →
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {loading ? (
        <Spinner />
      ) : classes.length === 0 ? (
        <Card><EmptyState message="Chưa có lớp nào. Tạo lớp đầu tiên để bắt đầu." /></Card>
      ) : viewMode === 'cards' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <Card key={c.id} className="p-5 transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-800">{c.name} {c.archived && <span className="ml-1 rounded-sm border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">ĐÃ LƯU TRỮ</span>}</h3>
                  <p className="mt-0.5 text-sm text-slate-500">{c.subject || 'Không phân môn'}{c.academicYear ? ` · ${c.academicYear}` : ''}</p>
                </div>
              </div>
              <div className="mt-4 flex gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1.5"><i className="fas fa-users text-blue-700" /> {c.studentCount} HV</span>
                <span className="flex items-center gap-1.5"><i className="fas fa-book-open text-blue-700" /> {c.lectureCount} bài</span>
              </div>
              <div className="mt-4 flex gap-2">
                <Link to={`/classes/${c.id}`} className={`flex-1 ${detailLinkClass}`}>Xem chi tiết</Link>
                <Button
                  variant="ghost"
                  className={`!py-1.5 ${c.archived ? 'text-emerald-700 hover:bg-emerald-50' : 'text-slate-500 hover:bg-slate-100'}`}
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
                  className="!py-1.5 text-red-600 hover:bg-red-50"
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
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Lớp</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Môn / Năm</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">HV</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Bài giảng</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Trạng thái</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {classes.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{c.name}</td>
                    <td className="px-4 py-3 text-slate-500">{c.subject || '—'} {c.academicYear ? `· ${c.academicYear}` : ''}</td>
                    <td className="text-center px-4 py-3 text-slate-600">{c.studentCount}</td>
                    <td className="text-center px-4 py-3 text-slate-600">{c.lectureCount}</td>
                    <td className="text-center px-4 py-3">
                      {c.archived ? <Badge tone="slate">Đã lưu trữ</Badge> : <Badge tone="green">Đang hoạt động</Badge>}
                    </td>
                    <td className="text-right px-4 py-3 flex items-center justify-end gap-1">
                      <Link to={`/classes/${c.id}`} className={`!px-2 !py-1.5 ${detailLinkClass}`}>Chi tiết</Link>
                      <Button
                        variant="ghost"
                        className={`!py-1.5 ${c.archived ? 'text-emerald-700' : 'text-slate-500'}`}
                        onClick={async () => {
                          await api(`/classes/${c.id}/archive`, { method: 'PATCH', body: JSON.stringify({ archived: !c.archived }) });
                          toast.success(c.archived ? 'Đã khôi phục' : 'Đã lưu trữ');
                          await load();
                        }}
                      >
                        {c.archived ? 'Khôi phục' : 'Lưu trữ'}
                      </Button>
                      <Button variant="ghost" className="!py-1.5 text-red-600" onClick={async () => {
                        if (!window.confirm(`Xóa "${c.name}"?`)) return;
                        await api(`/classes/${c.id}`, { method: 'DELETE' });
                        toast.success('Đã xóa');
                        await load();
                      }}>Xóa</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CreateClassModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
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
