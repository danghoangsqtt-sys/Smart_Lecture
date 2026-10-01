import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Spinner } from '../components/ui';
import { sharedCurriculum } from '../lib/sharedCurriculum';
import type { SharedLesson, SharedLessonProgress, SharedMaterial, SharedQuestion, SharedSubject } from '../types';
import { useAuthStore } from '../stores/authStore';
import toast from '../stores/toastStore';
import { SharedTeachingViewer, type SharedContentMode } from '../features/curriculum/SharedTeachingViewer';
import { SharedGamePanel } from '../features/curriculum/SharedGamePanel';

type Mode = SharedContentMode | 'game';
const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: 'slides', label: 'Trình chiếu', icon: 'fa-file-powerpoint' },
  { id: 'video', label: 'Video', icon: 'fa-video' },
  { id: 'links', label: 'Tài liệu', icon: 'fa-link' },
  { id: 'game', label: 'Trò chơi', icon: 'fa-gamepad' },
];

export default function SharedTeachingPage() {
  const { classId = '', subjectId = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [subject, setSubject] = useState<SharedSubject | null>(null);
  const [className, setClassName] = useState('');
  const [lessons, setLessons] = useState<SharedLesson[]>([]);
  const [progress, setProgress] = useState<SharedLessonProgress[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [materials, setMaterials] = useState<SharedMaterial[]>([]);
  const [questions, setQuestions] = useState<SharedQuestion[]>([]);
  const [mode, setMode] = useState<Mode>('slides');
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([sharedCurriculum.classSubjects(classId), sharedCurriculum.classes()])
      .then(async ([assignments, classes]) => {
        const assigned = assignments.find((item) => item.id === subjectId);
        if (!assigned) throw new Error('Môn học chưa được gắn với lớp này. Hãy phân công trong Chương trình đào tạo.');
        const [lessonRows, progressRows] = await Promise.all([
          sharedCurriculum.lessons(subjectId), sharedCurriculum.progress(classId, subjectId),
        ]);
        if (!active) return;
        setSubject(assigned);
        setClassName(classes.find((item) => item.id === classId)?.name ?? 'Lớp học');
        setLessons(lessonRows);
        setProgress(progressRows);
        setSelectedId(lessonRows[0]?.id ?? '');
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Không tải được môn học'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [classId, subjectId]);

  useEffect(() => {
    if (!selectedId) { setMaterials([]); setQuestions([]); return; }
    let active = true;
    setContentLoading(true);
    void Promise.all([sharedCurriculum.materials(selectedId), sharedCurriculum.questions(selectedId)])
      .then(([media, linked]) => { if (active) { setMaterials(media); setQuestions(linked); } })
      .catch((reason: unknown) => { if (active) toast.error(reason instanceof Error ? reason.message : 'Không tải được nội dung bài'); })
      .finally(() => { if (active) setContentLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const selected = lessons.find((lesson) => lesson.id === selectedId);
  const currentProgress = progress.find((item) => item.lesson_id === selectedId);
  const planned = currentProgress?.planned_periods ?? 1;
  const completed = currentProgress?.completed_periods ?? 0;

  async function updateProgress(status: 'in_progress' | 'completed') {
    if (!selected) return;
    setSaving(true);
    try {
      await sharedCurriculum.saveProgress(classId, subjectId, selected.id, {
        plannedPeriods: planned,
        completedPeriods: status === 'completed' ? planned : completed,
        status,
      });
      setProgress(await sharedCurriculum.progress(classId, subjectId));
      toast.success(status === 'completed' ? 'Đã hoàn thành bài cho lớp này' : 'Đã đánh dấu bài đang dạy cho lớp này');
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Không cập nhật được tiến độ'); }
    finally { setSaving(false); }
  }

  if (user?.role === 'student') return <div className="p-8 text-sm">Chỉ giảng viên được mở workspace giảng dạy.</div>;
  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-900"><Spinner /></div>;
  if (error || !subject) return <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-900 p-6 text-center text-white">
    <p>{error || 'Không tìm thấy môn học'}</p><Button onClick={() => navigate('/teaching')}>Về Giảng dạy</Button>
  </div>;

  return <div className="flex min-h-screen flex-col bg-slate-950 text-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 bg-blue-950 px-4 py-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-blue-300">Workspace giảng dạy · nguồn dùng chung</p>
        <h1 className="text-lg font-black">{subject.name} <span className="font-medium text-blue-200">· {className}</span></h1></div>
      <div className="flex flex-wrap gap-2"><Link to={`/classes/${classId}?tab=attendance`} className="rounded border border-blue-400 px-3 py-2 text-xs font-bold text-blue-100 hover:bg-white/10">Điểm danh lớp</Link>
        <Button variant="secondary" onClick={() => navigate('/teaching')}>Thoát workspace</Button></div>
    </header>
    <div className="border-b border-amber-700/50 bg-amber-950/30 px-4 py-2 text-xs text-amber-100">
      Nội dung dùng chung; tiến độ lưu riêng cho {className}. Nhật ký buổi dạy nhiều lớp sẽ được nối ở P89.
    </div>
    {lessons.length === 0 ? <div className="flex flex-1 items-center justify-center p-6 text-center text-slate-400">
      Môn này chưa có bài học. <Link to="/curriculum" className="ml-1 text-blue-300 underline">Chuẩn bị trong Chương trình đào tạo</Link>
    </div> : <div className="grid min-h-0 flex-1 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-b border-slate-700 bg-slate-900 p-3 lg:border-b-0 lg:border-r">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Các bài của môn</p>
        {lessons.map((lesson) => {
          const row = progress.find((item) => item.lesson_id === lesson.id);
          return <button key={lesson.id} type="button" onClick={() => { setSelectedId(lesson.id); setMode('slides'); }}
            className={`mb-1 w-full rounded p-3 text-left text-sm ${selectedId === lesson.id ? 'bg-blue-900 text-white' : 'text-slate-300 hover:bg-slate-800'}`}>
            {lesson.chapter && <span className="block truncate text-xs opacity-70">{lesson.chapter}</span>}
            <span className="block font-bold">{lesson.title}</span>
            <span className="text-xs opacity-70">{row?.status === 'completed' ? 'Đã hoàn thành' : row?.status === 'in_progress' ? 'Đang dạy' : 'Chưa bắt đầu'}</span>
          </button>;
        })}
      </aside>
      <main className="min-w-0 p-4 lg:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-black">{selected?.title}</h2><p className="text-sm text-slate-400">{selected?.description}</p></div>
          <Badge tone={currentProgress?.status === 'completed' ? 'green' : currentProgress?.status === 'in_progress' ? 'indigo' : 'slate'}>
            {completed}/{planned} tiết · {currentProgress?.status === 'completed' ? 'Hoàn thành' : currentProgress?.status === 'in_progress' ? 'Đang dạy' : 'Chờ'}</Badge>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">{MODES.map((item) => <button key={item.id} type="button" onClick={() => setMode(item.id)}
          className={`rounded px-3 py-2 text-xs font-bold ${mode === item.id ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
          <i className={`fas ${item.icon} mr-2`} />{item.label}</button>)}</div>
        {contentLoading && mode !== 'game' ? <Spinner /> : selected && mode !== 'game' &&
          <SharedTeachingViewer materials={materials} mode={mode} />}
        {selected && <div className={mode === 'game' ? '' : 'hidden'}>
          <SharedGamePanel classId={classId} lessonTitle={selected.title} questions={questions} onExit={() => setMode('slides')} />
        </div>}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-700 pt-4">
          <span className="mr-2 text-xs text-slate-400">Tiến độ riêng của {className}</span>
          <Button variant="secondary" disabled={saving || !selected} onClick={() => void updateProgress('in_progress')}>Đánh dấu đang dạy</Button>
          <Button disabled={saving || !selected} onClick={() => void updateProgress('completed')}>Hoàn thành bài</Button>
        </div>
      </main>
    </div>}
  </div>;
}
