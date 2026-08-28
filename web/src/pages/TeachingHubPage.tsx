import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, Spinner } from '../components/ui';
import { useAuthStore } from '../stores/authStore';
import toast from '../stores/toastStore';

interface ClassInfo { id: string; name: string; subject: string; academicYear: string; studentCount: number; }
interface Subject { id: string; name: string; sortOrder: number; }
interface TeachingInsights {
  summary: {
    sessionCount: number; activeSessionCount: number; completedSessionCount: number; totalDurationMinutes: number;
    attendanceLinkedCount: number; uniqueSlidesShown: number; uniqueVideosPlayed: number; uniqueGamesRun: number;
    kttxRecordedCount: number; curriculumTotal: number; curriculumCompleted: number; curriculumProgressPercent: number;
  };
  dataQuality: { sessionsWithoutAttendanceRecord: number; sessionsWithoutAttendanceLink: number; sessionsWithoutActivityTelemetry: number; note: string };
  recent: Array<{ id: string; subjectName: string | null; curriculumTopic: string | null; startedAt: string; endedAt: string | null; attendanceTaken: boolean; activityCount: number; games: Array<{ id: string; title: string; gameType: string }>; notes: string }>;
}

interface TeachingReadiness {
  curriculum: { itemCount: number; linkedLectureCount: number };
  materials: { presentationCount: number; pdfCanvasReadyCount: number; pptxCount: number; pptxPendingConversionCount: number; videoCount: number; linkCount: number };
  powerPointConversion: { required: boolean; available: boolean | null; note: string };
  note: string;
}

export default function TeachingHubPage() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [classId, setClassId] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [subjectName, setSubjectName] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [insightSubjectId, setInsightSubjectId] = useState('');
  const [insights, setInsights] = useState<TeachingInsights | null>(null);
  const [readiness, setReadiness] = useState<TeachingReadiness | null>(null);
  const [exporting, setExporting] = useState(false);

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
  useEffect(() => { setInsightSubjectId((current) => current && subjects.some((subject) => subject.id === current) ? current : ''); }, [subjects]);

  const loadInsights = useCallback(async () => {
    if (!classId) { setInsights(null); return; }
    try {
      const suffix = insightSubjectId ? `?subjectId=${encodeURIComponent(insightSubjectId)}` : '';
      setInsights(await api<TeachingInsights>(`/classes/${classId}/teaching-logs/summary${suffix}`));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không tải được tổng quan sau tiết học'); }
  }, [classId, insightSubjectId]);

  useEffect(() => { void loadInsights(); }, [loadInsights]);

  const loadReadiness = useCallback(async () => {
    if (!classId) { setReadiness(null); return; }
    try {
      const suffix = insightSubjectId ? `?subjectId=${encodeURIComponent(insightSubjectId)}` : '';
      setReadiness(await api<TeachingReadiness>(`/classes/${classId}/teaching-readiness${suffix}`));
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không thể kiểm tra học liệu trước giờ dạy'); }
  }, [classId, insightSubjectId]);

  useEffect(() => { void loadReadiness(); }, [loadReadiness]);
  useEffect(() => {
    if (!readiness?.powerPointConversion.required || readiness.powerPointConversion.available !== null) return;
    const retry = window.setTimeout(() => { void loadReadiness(); }, 1000);
    return () => window.clearTimeout(retry);
  }, [readiness, loadReadiness]);

  async function createSubject() {
    if (!classId || !subjectName.trim()) return;
    setBusy(true);
    try {
      await api(`/classes/${classId}/subjects`, { method: 'POST', body: JSON.stringify({ name: subjectName.trim() }) });
      setSubjectName(''); setCreateOpen(false); await loadSubjects(); toast.success('Đã tạo môn học');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Không tạo được môn học'); }
    finally { setBusy(false); }
  }

  async function exportPostLessonReport(format: 'xlsx' | 'csv') {
    if (!classId) return;
    setExporting(true);
    try {
      const token = useAuthStore.getState().token;
      const subjectQuery = insightSubjectId ? `&subjectId=${encodeURIComponent(insightSubjectId)}` : '';
      const response = await fetch(`/api/classes/${classId}/teaching-logs/export?format=${format}${subjectQuery}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Không thể xuất báo cáo sau tiết');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `bao-cao-sau-tiet.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã xuất báo cáo ${format.toUpperCase()}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không thể xuất báo cáo sau tiết'); }
    finally { setExporting(false); }
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
      <TeachingReadinessCard readiness={readiness} />
      <TeachingInsightsCard subjects={subjects} selectedSubjectId={insightSubjectId} onSubjectChange={setInsightSubjectId} insights={insights} />
      <div className="mb-5 flex flex-wrap items-center justify-end gap-2"><Button variant="secondary" onClick={() => void exportPostLessonReport('xlsx')} disabled={exporting} aria-label="Xuất báo cáo sau tiết dạng XLSX"><i className="fas fa-file-excel" /> {exporting ? 'Đang xuất…' : 'Xuất XLSX'}</Button><Button variant="secondary" onClick={() => void exportPostLessonReport('csv')} disabled={exporting} aria-label="Xuất báo cáo sau tiết dạng CSV"><i className="fas fa-file-csv" /> Xuất CSV</Button></div>
      <div className="mb-3 flex items-center justify-between"><div><h2 className="font-black text-slate-800">Môn học của {selectedClass?.name}</h2><p className="text-sm text-slate-500">Mỗi môn có cây chương trình, bài giảng và học liệu riêng.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{subjects.length} môn</span></div>
      {subjects.length === 0 ? <Card className="p-8"><EmptyState message="Chưa có môn học. Tạo môn đầu tiên để xây dựng cây nội dung." /></Card> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{subjects.map((subject) => <Card key={subject.id} className="group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-lg"><div className="absolute right-[-8px] top-[-10px] text-7xl text-blue-50"><i className="fas fa-book-bookmark" /></div><p className="relative text-[10px] font-black uppercase tracking-widest text-blue-600">Môn học</p><h3 className="relative mt-2 text-lg font-black text-slate-800">{subject.name}</h3><p className="relative mt-2 text-sm text-slate-500">Sắp xếp bài giảng theo cây chương trình, rồi mở workspace khi bắt đầu tiết học.</p><Button className="relative mt-5 w-full" onClick={() => navigate(`/classes/${classId}/teach/${subject.id}`)}>Mở workspace <i className="fas fa-arrow-right" /></Button></Card>)}</div>}
    </>}
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tạo môn học"><div className="space-y-4"><div><Label>Tên môn học</Label><Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="Ví dụ: Vật lý 10" autoFocus /></div><p className="rounded-sm bg-blue-50 p-3 text-xs leading-5 text-blue-900"><i className="fas fa-circle-info mr-1" /> Sau khi tạo, bạn có thể thêm chương trình, bài giảng, PDF/PPTX, video và liên kết game cho môn này.</p><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Hủy</Button><Button onClick={() => void createSubject()} disabled={busy || !subjectName.trim()}>{busy ? 'Đang tạo…' : 'Tạo môn học'}</Button></div></div></Modal>
  </div>;
}

function TeachingReadinessCard({ readiness }: { readiness: TeachingReadiness | null }) {
  if (!readiness) return <Card className="mb-5 p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Đang kiểm tra học liệu trước giờ dạy…</div></Card>;
  const { curriculum, materials } = readiness;
  const checks = [
    ['fa-diagram-project', 'Mục chương trình đã liên kết', `${curriculum.linkedLectureCount}/${curriculum.itemCount}`],
    ['fa-file-pdf', 'Sẵn sàng trên canvas PDF', String(materials.pdfCanvasReadyCount)],
    ['fa-file-powerpoint', 'PPTX cần chuyển đổi', String(materials.pptxPendingConversionCount)],
    ['fa-video', 'Video đã liên kết', String(materials.videoCount)],
  ];
  const converterState = readiness.powerPointConversion.available;
  return <Card className="mb-5 overflow-hidden"><div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50 px-5 py-3"><i className="fas fa-clipboard-check text-emerald-700" /><div><h2 className="font-black text-emerald-950">Sẵn sàng trước giờ dạy</h2><p className="text-xs text-emerald-800">Kiểm kê theo lớp và môn đang chọn; không đánh giá chất lượng buổi dạy.</p></div></div><div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-4">{checks.map(([icon, label, value]) => <div key={label} className="bg-white p-4"><p className="text-xs font-semibold text-slate-500"><i className={`fas ${icon} mr-1 text-emerald-700`} />{label}</p><p className="mt-1 text-2xl font-black text-slate-800">{value}</p></div>)}</div>{readiness.powerPointConversion.required && <p className={`border-t px-5 py-2 text-xs ${converterState === true ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : converterState === false ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-blue-200 bg-blue-50 text-blue-950'}`}><i className={`fas ${converterState === true ? 'fa-circle-check' : converterState === false ? 'fa-triangle-exclamation' : 'fa-spinner fa-spin'} mr-1`} />{readiness.powerPointConversion.note}</p>}{materials.pptxPendingConversionCount > 0 && <p className="border-t border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-950"><i className="fas fa-circle-info mr-1" />Mở workspace để chuyển PPTX sang PDF và dùng công cụ chú thích.</p>}</Card>;
}

function TeachingInsightsCard({ subjects, selectedSubjectId, onSubjectChange, insights }: { subjects: Subject[]; selectedSubjectId: string; onSubjectChange: (value: string) => void; insights: TeachingInsights | null }) {
  if (!insights) return <Card className="mb-5 p-5"><div className="flex items-center gap-3 text-sm text-slate-500"><Spinner /> Đang tổng hợp dữ liệu sau tiết học…</div></Card>;
  const { summary } = insights;
  const stats = [
    ['fa-clock', 'Phiên hoàn tất', `${summary.completedSessionCount}/${summary.sessionCount}`],
    ['fa-list-check', 'Tiến độ giáo án', `${summary.curriculumProgressPercent}%`],
    ['fa-calendar-check', 'Điểm danh liên kết', String(summary.attendanceLinkedCount)],
    ['fa-gamepad', 'Hoạt động game', String(summary.uniqueGamesRun)],
  ];
  return <Card className="mb-5 overflow-hidden">
    <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-amber-950"><i className="fas fa-circle-info mr-1" />{insights.dataQuality.sessionsWithoutAttendanceRecord} phiên chưa ghi nhận điểm danh · {insights.dataQuality.sessionsWithoutActivityTelemetry} phiên chưa có hoạt động được ghi log. Đây là dữ liệu chưa ghi nhận, không phải đánh giá kết quả học tập.</div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3"><div><h2 className="font-black text-slate-800">Tổng quan sau tiết học</h2><p className="text-xs text-slate-500">Dữ liệu được tổng hợp từ các phiên dạy đã lưu.</p></div><Select value={selectedSubjectId} onChange={(event) => onSubjectChange(event.target.value)} className="w-52"><option value="">Tất cả môn học</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</Select></div>
    <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([icon, label, value]) => <div key={label} className="bg-white p-4"><p className="text-xs font-semibold text-slate-500"><i className={`fas ${icon} mr-1 text-blue-600`} />{label}</p><p className="mt-1 text-2xl font-black text-slate-800">{value}</p></div>)}</div>
    <div className="grid gap-4 p-5 lg:grid-cols-[1fr_1.25fr]"><div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-950"><p className="font-bold">Học liệu đã dùng</p><p className="mt-2">{summary.uniqueSlidesShown} trình chiếu · {summary.uniqueVideosPlayed} video</p><p className="mt-1">{summary.totalDurationMinutes} phút dạy đã kết thúc · {summary.activeSessionCount} phiên đang mở</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full bg-blue-700" style={{ width: `${summary.curriculumProgressPercent}%` }} /></div><p className="mt-1 text-xs">{summary.curriculumCompleted}/{summary.curriculumTotal} mục giáo án hoàn thành</p></div><div><p className="mb-2 text-sm font-bold text-slate-700">Phiên gần đây</p>{insights.recent.length === 0 ? <p className="text-sm text-slate-500">Chưa có phiên dạy nào được tổng kết.</p> : <ul className="space-y-2">{insights.recent.map((session) => <li key={session.id} className="rounded border border-slate-100 px-3 py-2 text-sm"><div className="flex justify-between gap-3"><span className="truncate font-semibold text-slate-700">{session.curriculumTopic || session.subjectName || 'Phiên dạy'}</span><span className={`shrink-0 text-xs font-bold ${session.endedAt ? 'text-emerald-700' : 'text-amber-700'}`}>{session.endedAt ? 'Đã kết thúc' : 'Đang diễn ra'}</span></div><p className="mt-1 text-xs text-slate-500">{new Date(session.startedAt).toLocaleString('vi-VN')} · {session.activityCount} hoạt động · {session.attendanceTaken ? 'đã điểm danh' : 'chưa điểm danh'}</p>{session.games.length > 0 && <p className="mt-1 truncate text-xs font-medium text-violet-700"><i className="fas fa-gamepad mr-1" />{session.games.map((game) => game.title).join(' · ')}</p>}</li>)}</ul>}</div></div>
  </Card>;
}
