import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Label, Modal, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import toast from '../../stores/toastStore';
import type { ContentMode, CurriculumItem, PendingFile, TeachingLecture, TeachingPlan } from './CurriculumTab';
import type { Subject } from './types';

function getTeachingMaterialsByType(lecture: TeachingLecture | null, type: ContentMode): TeachingMaterial[] {
  if (!lecture) return [];
  const materials = lecture.materials as TeachingMaterial[];
  switch (type) {
    case 'slides':
      return materials.filter((material) => material.type === 'pptx' || material.type === 'pdf');
    case 'video':
      return materials.filter((material) => material.type === 'video');
    case 'links':
      return materials.filter((material) => material.type === 'link');
    default:
      return [];
  }
}

export function TeachingModeTab({ classId, canManage }: { classId: string; canManage: boolean }) {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [plans, setPlans] = useState<TeachingPlan[]>([]);
  const [lectures, setLectures] = useState<TeachingLecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const linkSectionRef = useRef<HTMLDivElement>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [dropPath, setDropPath] = useState('');
  const [intakeOpen, setIntakeOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subjectsRes, plansRes, lecturesRes] = await Promise.all([
        api<{ subjects: Subject[] }>(`/classes/${classId}/subjects`),
        api<{ plans: TeachingPlan[] }>(`/classes/${classId}/teaching-plans`),
        api<{ lectures: TeachingLecture[] }>(`/classes/${classId}/lectures`),
      ]);
      setSubjects(subjectsRes.subjects);
      setPlans(plansRes.plans);
      setLectures(lecturesRes.lectures);
      if (subjectsRes.subjects.length > 0 && !selectedSubjectId) {
        setSelectedSubjectId(subjectsRes.subjects[0].id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [classId, selectedSubjectId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const scanPendingFiles = useCallback(async () => {
    if (!selectedSubjectId) { setPendingFiles([]); return; }
    try {
      const res = await api<{ dropPath: string; files: PendingFile[] }>(`/subjects/${selectedSubjectId}/pending-files`);
      setDropPath(res.dropPath);
      setPendingFiles(res.files);
    } catch {
      // silent — polling shouldn't spam toasts every 10s on a transient failure
    }
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!canManage) return;
    void scanPendingFiles();
    const interval = setInterval(() => { void scanPendingFiles(); }, 10_000);
    return () => clearInterval(interval);
  }, [canManage, scanPendingFiles]);

  const subjectPlans = plans.filter((p) => p.subjectId === selectedSubjectId);

  useEffect(() => {
    if (subjectPlans.length > 0 && !subjectPlans.some((p) => p.id === selectedPlanId)) {
      setSelectedPlanId(subjectPlans[0].id);
      setSelectedItemId(null);
    } else if (subjectPlans.length === 0) {
      setSelectedPlanId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubjectId, plans]);

  async function linkItemToLecture(itemId: string, lectureId: string | null) {
    try {
      await api(`/curriculum-items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ lectureId }) });
      toast.success(lectureId ? 'Đã liên kết bài giảng' : 'Đã hủy liên kết');
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function updateItemStatus(itemId: string, status: CurriculumItem['status']) {
    try {
      await api(`/curriculum-items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast.success('Đã cập nhật trạng thái');
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  if (loading) return <Spinner />;

  const plan = plans.find((candidate) => candidate.id === selectedPlanId);
  const selectedItem = plan?.items.find((item) => item.id === selectedItemId) ?? plan?.items[0] ?? null;
  const linkedLecture = selectedItem?.lectureId
    ? lectures.find((lecture) => lecture.id === selectedItem.lectureId) ?? null
    : null;

  return (
    <div className="flex flex-col">
      <TeachingModeSelectors
        subjects={subjects}
        subjectPlans={subjectPlans}
        selectedSubjectId={selectedSubjectId}
        selectedPlanId={selectedPlanId}
        onSubjectChange={(id) => { setSelectedSubjectId(id); setSelectedItemId(null); }}
        onPlanChange={(id) => { setSelectedPlanId(id); setSelectedItemId(null); }}
      />
      {canManage && selectedSubjectId && (
        <PendingFilesBanner
          pendingFiles={pendingFiles}
          dropPath={dropPath}
          onOpen={() => setIntakeOpen(true)}
          onScan={scanPendingFiles}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <TeachingPlanSidebar
          plans={subjectPlans}
          plan={plan}
          selectedPlanId={selectedPlanId}
          selectedItemId={selectedItemId}
          onPlanChange={(id) => { setSelectedPlanId(id); setSelectedItemId(null); }}
          onItemChange={setSelectedItemId}
        />
        <TeachingItemPanel
          classId={classId}
          subjectId={selectedSubjectId}
          item={selectedItem}
          lecture={linkedLecture}
          lectures={lectures}
          canManage={canManage}
          linkSectionRef={linkSectionRef}
          onStatusChange={updateItemStatus}
          onLectureChange={linkItemToLecture}
          onTeach={(path) => navigate(path)}
        />
      </div>

      {intakeOpen && selectedSubjectId && (
        <IntakeModal
          subjectId={selectedSubjectId}
          files={pendingFiles}
          lectures={lectures}
          onClose={() => setIntakeOpen(false)}
          onIngested={async () => {
            setIntakeOpen(false);
            await scanPendingFiles();
            await loadData();
          }}
        />
      )}
    </div>
  );
}

function TeachingModeSelectors({ subjects, subjectPlans, selectedSubjectId, selectedPlanId, onSubjectChange, onPlanChange }: {
  subjects: Subject[];
  subjectPlans: TeachingPlan[];
  selectedSubjectId: string | null;
  selectedPlanId: string | null;
  onSubjectChange: (id: string | null) => void;
  onPlanChange: (id: string | null) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h4 className="font-semibold text-slate-700">Chế độ giảng dạy</h4>
      <div className="flex items-center gap-2">
        <Select value={selectedSubjectId ?? ''} onChange={(event) => onSubjectChange(event.target.value || null)} className="w-48">
          <option value="">— Chọn môn học —</option>
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </Select>
        <Select value={selectedPlanId ?? ''} onChange={(event) => onPlanChange(event.target.value || null)} className="w-64">
          <option value="">— Chọn chương trình —</option>
          {subjectPlans.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </Select>
      </div>
    </div>
  );
}

function PendingFilesBanner({ pendingFiles, dropPath, onOpen, onScan }: {
  pendingFiles: PendingFile[];
  dropPath: string;
  onOpen: () => void;
  onScan: () => Promise<void>;
}) {
  return (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-blue-200 bg-blue-50 p-4">
      <div className="text-sm text-slate-700">
        {pendingFiles.length > 0 ? (
          <><i className="fas fa-folder-open mr-2 text-blue-600" /><strong>{pendingFiles.length} tệp mới</strong> trong thư mục — nhập vào bài giảng?</>
        ) : (
          <><i className="fas fa-folder mr-2 text-slate-400" />Dán tệp PPTX/Video vào: <code className="rounded bg-white px-1.5 py-0.5 text-xs">{dropPath}</code></>
        )}
      </div>
      <div className="flex items-center gap-2">
        {pendingFiles.length > 0 && <Button className="!py-1.5" onClick={onOpen}>Nhập ngay</Button>}
        <Button variant="secondary" className="!py-1.5" onClick={() => void onScan()}><i className="fas fa-rotate" /> Quét lại</Button>
      </div>
    </Card>
  );
}

function TeachingPlanSidebar({ plans, plan, selectedPlanId, selectedItemId, onPlanChange, onItemChange }: {
  plans: TeachingPlan[];
  plan: TeachingPlan | undefined;
  selectedPlanId: string | null;
  selectedItemId: string | null;
  onPlanChange: (id: string | null) => void;
  onItemChange: (id: string) => void;
}) {
  return (
    <aside className="lg:col-span-1">
      <Card className="p-4">
        <h5 className="mb-3 font-semibold text-slate-700">Chương trình đào tạo</h5>
        <Select value={selectedPlanId ?? ''} onChange={(event) => onPlanChange(event.target.value || null)} className="mb-4 w-full">
          <option value="">— Chọn chương trình —</option>
          {plans.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.totalPeriods} tiết)</option>)}
        </Select>
        {plan && (
          <ul className="max-h-96 space-y-1 overflow-y-auto">
            {plan.items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onItemChange(item.id)} className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition ${selectedItemId === item.id ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${item.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : item.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                    {item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '▶' : item.sortOrder + 1}
                  </span>
                  <span className="flex-1 truncate">{item.week ? `T${item.week} ` : ''}{item.topic}</span>
                  {item.lectureId && <i className="fas fa-link text-xs text-blue-500" title="Đã liên kết bài giảng" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </aside>
  );
}

function TeachingItemPanel({ classId, subjectId, item, lecture, lectures, canManage, linkSectionRef, onStatusChange, onLectureChange, onTeach }: {
  classId: string;
  subjectId: string | null;
  item: CurriculumItem | null;
  lecture: TeachingLecture | null;
  lectures: TeachingLecture[];
  canManage: boolean;
  linkSectionRef: React.RefObject<HTMLDivElement | null>;
  onStatusChange: (itemId: string, status: CurriculumItem['status']) => Promise<void>;
  onLectureChange: (itemId: string, lectureId: string | null) => Promise<void>;
  onTeach: (path: string) => void;
}) {
  if (!item) {
    return <main className="space-y-4 lg:col-span-2"><Card className="p-12 text-center"><i className="fas fa-chalkboard-teacher mb-3 text-5xl text-slate-300" /><h5 className="mb-1 text-lg font-medium text-slate-500">Chưa chọn mục chương trình</h5><p className="text-sm text-slate-400">Chọn một chương trình và mục ở thanh bên để xem tài liệu và bắt đầu giảng dạy</p></Card></main>;
  }

  const progress = item.plannedPeriods > 0 ? (item.completedPeriods / item.plannedPeriods) * 100 : 0;
  return (
    <main className="space-y-4 lg:col-span-2">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div><h4 className="font-semibold text-slate-800">{item.week ? `Tuần ${item.week} — ` : ''}{item.topic}</h4><p className="text-sm text-slate-500">{item.chapter} · {item.plannedPeriods} tiết · {item.completedPeriods}/{item.plannedPeriods} đã dạy</p></div>
          {canManage && <div className="flex gap-2"><Select value={item.status} onChange={(event) => void onStatusChange(item.id, event.target.value as CurriculumItem['status'])} className="w-32"><option value="pending">Chờ</option><option value="in_progress">Đang dạy</option><option value="completed">Hoàn thành</option></Select><Button variant="secondary" className="!py-1.5" onClick={() => void onStatusChange(item.id, 'in_progress')}>Bắt đầu</Button><Button className="!py-1.5" onClick={() => void onStatusChange(item.id, 'completed')}>Hoàn thành</Button></div>}
        </div>
        <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-900 transition-[width]" style={{ width: `${progress}%` }} /></div>
        {canManage && <div ref={linkSectionRef} className="mb-4 rounded border border-slate-200 bg-slate-50 p-3"><div className="mb-2 block text-sm font-medium text-slate-700">Liên kết bài giảng (để lấy tài liệu PPTX/Video/Link)</div><Select value={item.lectureId ?? ''} onChange={(event) => void onLectureChange(item.id, event.target.value || null)} className="w-full"><option value="">— Không liên kết —</option>{lectures.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.chapter ? `${candidate.chapter} — ` : ''}{candidate.title}</option>)}</Select></div>}
      </Card>
      {lecture ? (
        <Card className="p-4"><h5 className="mb-3 font-semibold text-slate-700">Tài liệu bài giảng: {lecture.title}</h5><div className="grid gap-3 sm:grid-cols-2"><MaterialSection title="📊 Trang chiếu (PPTX/PDF)" materials={getTeachingMaterialsByType(lecture, 'slides')} /><MaterialSection title="🎬 Video" materials={getTeachingMaterialsByType(lecture, 'video')} /><MaterialSection title="🔗 Liên kết & Tài liệu" materials={getTeachingMaterialsByType(lecture, 'links')} /><div className="sm:col-span-2"><Button variant="secondary" onClick={() => onTeach(`/classes/${classId}/teach/${subjectId}`)} disabled={!subjectId}><i className="fas fa-expand" /> ▶ Vào chế độ giảng dạy</Button></div></div></Card>
      ) : (
        <Card className="border-dashed border-slate-300 p-6 text-center"><i className="fas fa-link mb-2 text-3xl text-slate-400" /><p className="text-slate-500">Chưa liên kết bài giảng cho mục này</p>{canManage && <Button variant="secondary" className="mt-4" onClick={() => linkSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Liên kết bài giảng ngay</Button>}</Card>
      )}
    </main>
  );
}

function IntakeModal({
  subjectId,
  files,
  lectures,
  onClose,
  onIngested,
}: {
  subjectId: string;
  files: PendingFile[];
  lectures: TeachingLecture[];
  onClose: () => void;
  onIngested: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'new-lecture-per-file' | 'existing-lecture'>('new-lecture-per-file');
  const [lectureId, setLectureId] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (mode === 'existing-lecture' && !lectureId) {
      toast.error('Chọn bài giảng đích');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ created: unknown[]; errors: { filename: string; error: string }[] }>(
        `/subjects/${subjectId}/pending-files/ingest`,
        {
          method: 'POST',
          body: JSON.stringify({
            filenames: files.map((f) => f.filename),
            mode,
            ...(mode === 'existing-lecture' ? { lectureId } : {}),
          }),
        }
      );
      if (res.errors.length > 0) {
        toast.error(`${res.created.length} tệp đã nhập, ${res.errors.length} lỗi`);
      } else {
        toast.success(`Đã nhập ${res.created.length} tệp`);
      }
      await onIngested();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi nhập tệp');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Nhập ${files.length} tệp từ thư mục`}>
      <div className="space-y-3">
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded border border-slate-200 p-2 text-sm text-slate-600">
          {files.map((f) => (
            <li key={f.filename} className="flex items-center justify-between gap-2">
              <span className="truncate">{f.filename}</span>
              <span className="shrink-0 text-xs text-slate-400">{(f.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
            </li>
          ))}
        </ul>
        <div>
          <Label>Cách nhập</Label>
          <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="w-full">
            <option value="new-lecture-per-file">Mỗi tệp tạo một bài giảng mới</option>
            <option value="existing-lecture">Gắn tất cả vào một bài giảng có sẵn</option>
          </Select>
        </div>
        {mode === 'existing-lecture' && (
          <div>
            <Label>Bài giảng đích *</Label>
            <Select value={lectureId} onChange={(e) => setLectureId(e.target.value)} className="w-full">
              <option value="">— Chọn bài giảng —</option>
              {lectures.map((l) => (
                <option key={l.id} value={l.id}>{l.chapter ? `${l.chapter} — ` : ''}{l.title}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex justify-end pt-2">
          <Button onClick={() => void submit()} disabled={busy || files.length === 0}>Nhập</Button>
        </div>
      </div>
    </Modal>
  );
}

interface TeachingMaterial {
  id: string;
  type: string;
  title: string;
  linkUrl: string | null;
  sizeBytes: number;
  convertedFromId: string | null;
}

function MaterialSection({ title, materials }: { title: string; materials: TeachingMaterial[] }) {
  const token = useAuthStore((s) => s.token);
  return (
    <div className="space-y-2">
      <h6 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h6>
      {materials.length === 0 ? (
        <p className="text-sm text-slate-400 p-3 bg-slate-50 rounded text-center">Chưa có tài liệu</p>
      ) : (
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {materials.map((m) => (
            <li key={m.id} className="px-3 py-2 bg-white rounded border border-slate-200 hover:border-blue-300 transition">
              <a
                href={m.type === 'link' ? (m.linkUrl ?? '#') : `/api/media/${m.id}/stream?token=${encodeURIComponent(token ?? '')}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-slate-700 hover:text-blue-700"
              >
                <i className={`fas ${m.type === 'pptx' ? 'fa-file-powerpoint text-red-500' : m.type === 'pdf' ? 'fa-file-pdf text-red-500' : m.type === 'video' ? 'fa-file-video text-green-500' : 'fa-link text-blue-500'}`} />
                <span className="truncate">{m.title}</span>
                {m.sizeBytes > 0 && <span className="text-xs text-slate-400 ml-auto">{(m.sizeBytes / 1024 / 1024).toFixed(1)}MB</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
