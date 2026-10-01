import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, PageHeader, Select, Spinner } from '../components/ui';
import { sharedCurriculum, type ClassChoice } from '../lib/sharedCurriculum';
import type { SharedClassSubject } from '../types';
import toast from '../stores/toastStore';

interface ReadySubject {
  subject: SharedClassSubject;
  lessonCount: number;
  materialCount: number;
  questionCount: number;
  prepared: boolean;
}

export default function SharedTeachingHubPage() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassChoice[]>([]);
  const [classId, setClassId] = useState('');
  const [subjects, setSubjects] = useState<ReadySubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  useEffect(() => {
    let active = true;
    void sharedCurriculum.classes()
      .then((rows) => { if (active) { setClasses(rows); setClassId(rows[0]?.id ?? ''); } })
      .catch((reason: unknown) => { if (active) toast.error(reason instanceof Error ? reason.message : 'Không tải được danh sách lớp'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!classId) { setSubjects([]); return; }
    let active = true;
    setLoadingSubjects(true);
    setSubjects([]);
    void sharedCurriculum.classSubjects(classId)
      .then(async (assignments) => {
        const rows = await Promise.all(assignments.map(async (subject): Promise<ReadySubject> => {
          const lessons = await sharedCurriculum.lessons(subject.id);
          const content = await Promise.all(lessons.map(async (lesson) => {
            const [materials, questions] = await Promise.all([
              sharedCurriculum.materials(lesson.id), sharedCurriculum.questions(lesson.id),
            ]);
            return {
              materialCount: materials.filter((item) => item.asset_status === 'ready').length,
              questionCount: questions.filter((item) => item.type === 'mcq' || item.type === 'fill').length,
            };
          }));
          const materialCount = content.reduce((total, item) => total + item.materialCount, 0);
          const questionCount = content.reduce((total, item) => total + item.questionCount, 0);
          return { subject, lessonCount: lessons.length, materialCount, questionCount,
            prepared: content.some((item) => item.materialCount > 0 || (item.questionCount > 0 && item.questionCount <= 50)) };
        }));
        if (active) setSubjects(rows);
      })
      .catch((reason: unknown) => { if (active) toast.error(reason instanceof Error ? reason.message : 'Không tải được môn học của lớp'); })
      .finally(() => { if (active) setLoadingSubjects(false); });
    return () => { active = false; };
  }, [classId]);

  const selectedClass = classes.find((item) => item.id === classId);
  return <div>
    <PageHeader title="Giảng dạy" subtitle="Chọn lớp và môn đã gắn; bài giảng dùng chung, tiến độ theo từng lớp."
      actions={<Button onClick={() => navigate('/curriculum')}><i className="fas fa-book-open" /> Chương trình đào tạo</Button>} />
    <Card className="mb-5 p-4">
      <label htmlFor="teaching-class" className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-600">Lớp tham gia</label>
      {loading ? <Spinner /> : classes.length === 0 ? <EmptyState message="Chưa có lớp học. Hãy tạo lớp trước khi phân công môn." /> :
        <Select id="teaching-class" value={classId} onChange={(event) => setClassId(event.target.value)} className="max-w-lg">
          {classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.studentCount} học viên</option>)}
        </Select>}
    </Card>
    {loadingSubjects ? <Spinner /> : classId && subjects.length === 0 ?
      <Card className="p-6"><EmptyState message={`${selectedClass?.name ?? 'Lớp này'} chưa được gắn môn học. Hãy phân công môn trong Chương trình đào tạo.`} />
        <div className="text-center"><Link to="/curriculum" className="text-sm font-bold text-blue-900 underline">Mở Chương trình đào tạo</Link></div></Card> :
      <div className="grid gap-4 lg:grid-cols-2">{subjects.map(({ subject, lessonCount, materialCount, questionCount, prepared }) =>
        <Card key={subject.id} className="flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black text-blue-950">{subject.name}</h2>
            <p className="mt-1 text-sm text-slate-500">{subject.description || 'Môn học dùng chung cho các lớp được phân công.'}</p></div>
            <Badge tone={prepared ? 'green' : 'amber'}>{prepared ? 'Sẵn sàng' : 'Chưa có nội dung'}</Badge></div>
          <p className="text-xs text-slate-600">{lessonCount} bài · {materialCount} học liệu sẵn sàng · {questionCount} câu hỏi chơi được</p>
          <div className="mt-auto flex flex-wrap gap-2"><Button disabled={!prepared} onClick={() => navigate(`/shared-teach/${classId}/${subject.id}`)}>
            <i className="fas fa-chalkboard-teacher" /> Mở workspace</Button>
            {!prepared && <Button variant="secondary" onClick={() => navigate('/curriculum')}>Chuẩn bị bài giảng</Button>}
          </div>
        </Card>)}</div>}
    <p className="mt-6 text-xs text-slate-500">Dữ liệu giảng dạy kiểu cũ vẫn được giữ nguyên. <Link to="/teaching/legacy" className="font-bold text-blue-900 underline">Mở khu vực cũ</Link></p>
  </div>;
}
