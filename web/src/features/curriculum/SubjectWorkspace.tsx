import { useEffect, useState } from 'react';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, Spinner, Textarea } from '../../components/ui';
import { sharedCurriculum, type ClassChoice } from '../../lib/sharedCurriculum';
import type { SharedLesson, SharedSubject } from '../../types';
import toast from '../../stores/toastStore';
import { LessonWorkspace } from './LessonWorkspace';

export function SubjectWorkspace({ subject, onSubjectSaved }: {
  subject: SharedSubject;
  onSubjectSaved: (subject: SharedSubject) => void;
}) {
  const [name, setName] = useState(subject.name);
  const [description, setDescription] = useState(subject.description);
  const [lessons, setLessons] = useState<SharedLesson[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [classes, setClasses] = useState<ClassChoice[]>([]);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingClassId, setPendingClassId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonChapter, setLessonChapter] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([sharedCurriculum.lessons(subject.id), sharedCurriculum.classes()])
      .then(async ([lessonRows, classRows]) => {
        const linked = await Promise.all(classRows.map(async (cls) => ({
          classId: cls.id,
          assigned: (await sharedCurriculum.classSubjects(cls.id)).some((entry) => entry.id === subject.id),
        })));
        if (!active) return;
        setLessons(lessonRows);
        setSelectedLessonId(lessonRows[0]?.id ?? '');
        setClasses(classRows);
        setAssignedIds(linked.filter((row) => row.assigned).map((row) => row.classId));
      })
      .catch((error: unknown) => { if (active) toast.error(error instanceof Error ? error.message : 'Không tải được nội dung môn học'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [subject.id]);

  async function saveSubject() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const updated = await sharedCurriculum.updateSubject(subject.id, name.trim(), description.trim());
      onSubjectSaved(updated);
      toast.success('Đã lưu thông tin môn học');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không lưu được môn học'); }
    finally { setBusy(false); }
  }

  async function toggleClass(classId: string) {
    setPendingClassId(classId);
    const assigned = assignedIds.includes(classId);
    try {
      if (assigned) await sharedCurriculum.unassign(subject.id, classId);
      else await sharedCurriculum.assign(subject.id, classId);
      setAssignedIds((current) => assigned ? current.filter((id) => id !== classId) : [...current, classId]);
      toast.success(assigned ? 'Đã gỡ môn khỏi lớp' : 'Đã gắn môn vào lớp');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không đổi được phân công lớp'); }
    finally { setPendingClassId(''); }
  }

  async function createLesson() {
    if (!lessonTitle.trim()) return;
    setBusy(true);
    try {
      const sortOrder = Math.max(0, ...lessons.map((lesson) => lesson.sort_order)) + 1;
      const lesson = await sharedCurriculum.createLesson(subject.id, lessonTitle.trim(), lessonChapter.trim(), lessonDescription.trim(), sortOrder);
      setLessons((current) => [...current, lesson]);
      setSelectedLessonId(lesson.id);
      setLessonTitle(''); setLessonChapter(''); setLessonDescription(''); setCreateOpen(false);
      toast.success('Đã thêm bài học');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không thêm được bài học'); }
    finally { setBusy(false); }
  }

  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId);
  if (loading) return <Card className="p-4"><Spinner /></Card>;
  return <div className="min-w-0 space-y-5">
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-black text-slate-800">Thông tin môn học</h2><p className="text-xs text-slate-500">Một nguồn chung cho mọi lớp được gắn.</p></div>
        <Badge tone="indigo">{assignedIds.length} lớp · {lessons.length} bài</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <div><Label>Tên môn</Label><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} /></div>
        <div><Label>Mô tả</Label><Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} maxLength={2000} /></div>
      </div>
      <div className="mt-3 flex justify-end"><Button variant="secondary" disabled={busy || !name.trim()} onClick={() => void saveSubject()}>Lưu môn học</Button></div>
    </Card>
    <Card className="p-5">
      <h2 className="mb-1 font-black text-slate-800">Lớp học môn này</h2>
      <p className="mb-3 text-xs text-slate-500">Gắn cùng một môn vào nhiều lớp; tiến độ của từng lớp vẫn độc lập.</p>
      {classes.length === 0 ? <EmptyState message="Chưa có lớp để phân công." /> :
        <div className="grid gap-2 sm:grid-cols-2">{classes.map((cls) => <label key={cls.id} className="flex cursor-pointer items-center gap-3 rounded border border-slate-200 p-3 text-sm hover:bg-slate-50">
          <input type="checkbox" checked={assignedIds.includes(cls.id)} disabled={!!pendingClassId} onChange={() => void toggleClass(cls.id)} />
          <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{cls.name}</span><span className="text-xs text-slate-500">{cls.studentCount} học viên</span>
        </label>)}</div>}
    </Card>
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
        <div><h2 className="font-black text-slate-800">Bài học</h2><p className="text-xs text-slate-500">Slide, video và câu hỏi liên kết theo từng bài.</p></div>
        <Button onClick={() => setCreateOpen(true)}><i className="fas fa-plus" /> Thêm bài</Button>
      </div>
      {lessons.length === 0 ? <EmptyState message="Chưa có bài học. Thêm bài để chuẩn bị học liệu." /> :
        <div className="grid lg:grid-cols-[230px_minmax(0,1fr)]">
          <div className="border-b border-slate-200 bg-slate-50 p-2 lg:border-b-0 lg:border-r">{lessons.map((lesson) => <button key={lesson.id} type="button"
            onClick={() => setSelectedLessonId(lesson.id)}
            aria-current={selectedLessonId === lesson.id ? 'page' : undefined}
            className={`mb-1 w-full rounded px-3 py-3 text-left text-sm ${selectedLessonId === lesson.id ? 'bg-blue-900 font-bold text-white' : 'text-slate-700 hover:bg-blue-100'}`}>
            {lesson.chapter && <span className="block truncate text-xs opacity-70">{lesson.chapter}</span>}{lesson.title}
          </button>)}</div>
          {selectedLesson && <LessonWorkspace key={selectedLesson.id} lesson={selectedLesson}
            onSaved={(updated) => setLessons((current) => current.map((lesson) => lesson.id === updated.id ? updated : lesson))} />}
        </div>}
    </Card>
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Thêm bài học">
      <div className="space-y-3">
        <div><Label>Chương/phần</Label><Input value={lessonChapter} onChange={(event) => setLessonChapter(event.target.value)} maxLength={120} /></div>
        <div><Label>Tên bài *</Label><Input value={lessonTitle} onChange={(event) => setLessonTitle(event.target.value)} maxLength={200} /></div>
        <div><Label>Mô tả</Label><Textarea value={lessonDescription} onChange={(event) => setLessonDescription(event.target.value)} rows={3} maxLength={4000} /></div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Hủy</Button>
          <Button disabled={busy || !lessonTitle.trim()} onClick={() => void createLesson()}>Tạo bài</Button></div>
      </div>
    </Modal>
  </div>;
}
