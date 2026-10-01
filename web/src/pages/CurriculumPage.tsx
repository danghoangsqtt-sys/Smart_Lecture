import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Spinner } from '../components/ui';
import { sharedCurriculum } from '../lib/sharedCurriculum';
import type { SharedSubject } from '../types';
import toast from '../stores/toastStore';
import { SubjectWorkspace } from '../features/curriculum/SubjectWorkspace';

export default function CurriculumPage() {
  const [subjects, setSubjects] = useState<SharedSubject[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void sharedCurriculum.subjects()
      .then((items) => {
        if (!active) return;
        setSubjects(items);
        setSelectedId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? '');
      })
      .catch((error: unknown) => { if (active) toast.error(error instanceof Error ? error.message : 'Không tải được danh mục môn'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function createSubject() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const subject = await sharedCurriculum.createSubject(name.trim(), description.trim());
      setSubjects((current) => [subject, ...current]);
      setSelectedId(subject.id);
      setName('');
      setDescription('');
      setCreateOpen(false);
      toast.success('Đã tạo môn học dùng chung');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không tạo được môn học'); }
    finally { setBusy(false); }
  }

  const selected = subjects.find((subject) => subject.id === selectedId);
  return <div>
    <PageHeader title="Chương trình đào tạo" subtitle="Soạn môn, bài và học liệu một lần; gắn môn vào các lớp cần dạy."
      actions={<Button onClick={() => setCreateOpen(true)}><i className="fas fa-plus" /> Tạo môn học</Button>} />
    {loading ? <Spinner /> : <div className="grid gap-5 xl:grid-cols-[270px_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-600">Kho môn học · {subjects.length}</div>
        {subjects.length === 0 ? <EmptyState message="Chưa có môn học. Tạo môn đầu tiên để chuẩn bị bài giảng." /> :
          <div className="max-h-[70vh] overflow-y-auto p-2">{subjects.map((subject) => <button key={subject.id} type="button"
            onClick={() => setSelectedId(subject.id)}
            aria-current={subject.id === selectedId ? 'page' : undefined}
            className={`mb-1 w-full rounded px-3 py-3 text-left text-sm font-semibold transition ${subject.id === selectedId ? 'bg-blue-900 text-white' : 'text-slate-700 hover:bg-blue-50'}`}>
            <i className="fas fa-book-open mr-2" />{subject.name}
          </button>)}</div>}
      </Card>
      {selected ? <SubjectWorkspace key={selected.id} subject={selected}
        onSubjectSaved={(updated) => setSubjects((current) => current.map((item) => item.id === updated.id ? updated : item))} />
        : <Card className="p-8"><EmptyState message="Chọn hoặc tạo môn học để bắt đầu biên soạn." /></Card>}
    </div>}
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tạo môn học dùng chung">
      <div className="space-y-4">
        <div><Label>Tên môn học *</Label><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} autoFocus /></div>
        <div><Label>Mô tả</Label><textarea aria-label="Mô tả môn học" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000}
          className="min-h-20 w-full rounded border border-slate-300 p-3 text-sm" /></div>
        <p className="text-xs text-slate-500">Môn học không thuộc riêng lớp nào. Bạn có thể gắn môn vào nhiều lớp sau khi tạo.</p>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Hủy</Button>
          <Button onClick={() => void createSubject()} disabled={busy || !name.trim()}>{busy ? 'Đang tạo…' : 'Tạo môn'}</Button></div>
      </div>
    </Modal>
  </div>;
}
