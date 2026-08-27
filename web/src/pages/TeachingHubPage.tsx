import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, Spinner } from '../components/ui';
import toast from '../stores/toastStore';

interface ClassInfo { id: string; name: string; subject: string; academicYear: string; studentCount: number; }
interface Subject { id: string; name: string; sortOrder: number; }

export default function TeachingHubPage() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [classId, setClassId] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectName, setSubjectName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadClasses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ classes: ClassInfo[] }>('/classes/mine');
      setClasses(res.classes);
      setClassId((current) => current || res.classes[0]?.id || '');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Không tải được lớp học'); }
    finally { setLoading(false); }
  }, []);

  const loadSubjects = useCallback(async () => {
    if (!classId) { setSubjects([]); return; }
    try { setSubjects((await api<{ subjects: Subject[] }>(`/classes/${classId}/subjects`)).subjects); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Không tải được môn học'); }
  }, [classId]);

  useEffect(() => { void loadClasses(); }, [loadClasses]);
  useEffect(() => { void loadSubjects(); }, [loadSubjects]);

  async function createSubject() {
    if (!classId || !subjectName.trim()) return;
    setBusy(true);
    try {
      await api(`/classes/${classId}/subjects`, { method: 'POST', body: JSON.stringify({ name: subjectName.trim() }) });
      setSubjectName(''); setCreateOpen(false); await loadSubjects(); toast.success('Đã tạo môn học');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Không tạo được môn học'); }
    finally { setBusy(false); }
  }

  const selectedClass = classes.find((item) => item.id === classId);
  if (loading) return <Spinner />;

  return <div>
    <PageHeader title="Giảng dạy" subtitle="Chuẩn bị nội dung theo môn học và điều khiển buổi dạy liên tục" actions={<Button onClick={() => setCreateOpen(true)} disabled={!classId}><i className="fas fa-plus" /> Tạo môn học</Button>} />
    {classes.length === 0 ? <Card><EmptyState message="Hãy tạo lớp học trước để bắt đầu chuẩn bị môn học và bài giảng." /></Card> : <>
      <Card className="mb-5 overflow-hidden">
        <div className="bg-blue-950 px-5 py-5 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">Bàn điều khiển giảng dạy</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-black">Chọn lớp và môn để vào phiên dạy</h2><p className="mt-1 text-sm text-blue-100">Trình chiếu, video và game sẽ được giữ trong cùng một workspace.</p></div><i className="fas fa-chalkboard-user text-5xl text-blue-300/50" /></div>
        </div>
        <div className="p-5"><Label>Lớp học</Label><Select value={classId} onChange={(e) => setClassId(e.target.value)} className="max-w-xl">{classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.subject || 'Chưa đặt môn'} · {item.studentCount} học viên</option>)}</Select></div>
      </Card>
      <div className="mb-3 flex items-center justify-between"><div><h2 className="font-black text-slate-800">Môn học của {selectedClass?.name}</h2><p className="text-sm text-slate-500">Mỗi môn có cây chương trình, bài giảng và học liệu riêng.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{subjects.length} môn</span></div>
      {subjects.length === 0 ? <Card className="p-8"><EmptyState message="Chưa có môn học. Tạo môn đầu tiên để xây dựng cây nội dung." /></Card> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{subjects.map((subject) => <Card key={subject.id} className="group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-lg"><div className="absolute right-[-8px] top-[-10px] text-7xl text-blue-50"><i className="fas fa-book-bookmark" /></div><p className="relative text-[10px] font-black uppercase tracking-widest text-blue-600">Môn học</p><h3 className="relative mt-2 text-lg font-black text-slate-800">{subject.name}</h3><p className="relative mt-2 text-sm text-slate-500">Sắp xếp bài giảng theo cây chương trình, rồi mở workspace khi bắt đầu tiết học.</p><Button className="relative mt-5 w-full" onClick={() => navigate(`/classes/${classId}/teach/${subject.id}`)}>Mở workspace <i className="fas fa-arrow-right" /></Button></Card>)}</div>}
    </>}
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tạo môn học"><div className="space-y-4"><div><Label>Tên môn học</Label><Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Ví dụ: Vật lý 10" autoFocus /></div><p className="rounded-sm bg-blue-50 p-3 text-xs leading-5 text-blue-900"><i className="fas fa-circle-info mr-1" /> Sau khi tạo, bạn có thể thêm chương trình, bài giảng, PDF/PPTX, video và liên kết game cho môn này.</p><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Hủy</Button><Button onClick={() => void createSubject()} disabled={busy || !subjectName.trim()}>{busy ? 'Đang tạo…' : 'Tạo môn học'}</Button></div></div></Modal>
  </div>;
}
