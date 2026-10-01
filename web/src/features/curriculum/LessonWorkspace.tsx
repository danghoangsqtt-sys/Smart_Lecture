import { useState } from 'react';
import { Button, Input, Label, Textarea } from '../../components/ui';
import { sharedCurriculum } from '../../lib/sharedCurriculum';
import type { SharedLesson } from '../../types';
import toast from '../../stores/toastStore';
import { CurriculumMaterials } from './CurriculumMaterials';
import { CurriculumQuestions } from './CurriculumQuestions';

export function LessonWorkspace({ lesson, onSaved }: { lesson: SharedLesson; onSaved: (lesson: SharedLesson) => void }) {
  const [title, setTitle] = useState(lesson.title);
  const [chapter, setChapter] = useState(lesson.chapter);
  const [description, setDescription] = useState(lesson.description);
  const [sortOrder, setSortOrder] = useState(lesson.sort_order);
  const [tab, setTab] = useState<'materials' | 'questions'>('materials');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const updated = await sharedCurriculum.updateLesson(lesson.id, title.trim(), chapter.trim(), description.trim(), sortOrder);
      onSaved(updated);
      toast.success('Đã lưu bài học');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không lưu được bài học'); }
    finally { setBusy(false); }
  }

  return <div className="min-w-0 p-4">
    <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
      <div><Label>Chương/phần</Label><Input value={chapter} onChange={(event) => setChapter(event.target.value)} maxLength={120} /></div>
      <div><Label>Tên bài</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} /></div>
      <div><Label>Thứ tự</Label><Input type="number" min={0} max={100000} value={sortOrder}
        onChange={(event) => setSortOrder(Number(event.target.value) || 0)} className="w-24" /></div>
    </div>
    <div className="mt-3"><Label>Mục tiêu / mô tả</Label><Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} maxLength={4000} /></div>
    <div className="mt-3 flex justify-end"><Button variant="secondary" disabled={busy || !title.trim()} onClick={() => void save()}>Lưu bài</Button></div>
    <div className="mt-5 border-b border-slate-200" role="tablist" aria-label="Nội dung bài học">
      <button type="button" role="tab" aria-selected={tab === 'materials'} onClick={() => setTab('materials')}
        className={`mr-2 border-b-2 px-3 py-2 text-sm font-bold ${tab === 'materials' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500'}`}>Học liệu</button>
      <button type="button" role="tab" aria-selected={tab === 'questions'} onClick={() => setTab('questions')}
        className={`border-b-2 px-3 py-2 text-sm font-bold ${tab === 'questions' ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500'}`}>Câu hỏi ôn tập</button>
    </div>
    <div className="pt-4">{tab === 'materials' ? <CurriculumMaterials lessonId={lesson.id} /> : <CurriculumQuestions lessonId={lesson.id} />}</div>
  </div>;
}
