import { lazy, Suspense, useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { Button, Input, Label, Modal, Select, Spinner } from '../components/ui';
import toast from '../stores/toastStore';
import { toISODate } from '../lib/dateUtils';
import { PresentationCanvas } from '../features/presentation/PresentationCanvas';

const TEACHING_TYPES = ['Lý thuyết', 'Thực hành', 'Bài tập', 'Ôn tập', 'Kiểm tra', 'Thảo luận/Xemina', 'Trực tuyến'];
const EmbeddedGamesPage = lazy(() => import('./GamesPage'));

interface Subject {
  id: string;
  name: string;
  sortOrder: number;
}

interface CurriculumItem {
  id: string;
  week: number | null;
  chapter: string;
  topic: string;
  plannedPeriods: number;
  completedPeriods: number;
  status: 'pending' | 'in_progress' | 'completed';
  sortOrder: number;
  lectureId?: string | null;
}

interface TeachingPlan {
  id: string;
  classId: string;
  subjectId: string | null;
  name: string;
  description: string;
  totalPeriods: number;
  items: CurriculumItem[];
}

interface TeachingMaterial {
  id: string;
  type: string;
  title: string;
  linkUrl: string | null;
  sizeBytes: number;
  convertedFromId: string | null;
}

interface TeachingLecture {
  id: string;
  classId: string;
  subjectId: string | null;
  chapter: string;
  title: string;
  description: string;
  sortOrder: number;
  materials: unknown[];
}

interface TeachingLog {
  id: string;
  classId: string;
  subjectId: string | null;
  curriculumItemId: string | null;
  attendanceSessionId: string | null;
  startedAt: string;
  endedAt: string | null;
  slidesShown: string[];
  videosPlayed: string[];
  gamesRun: string[];
  attendanceTaken: boolean;
  notes: string;
}

type ContentMode = 'slides' | 'video' | 'links' | 'game';
interface DockPosition { x: number; y: number; }
interface VideoPlaybackCheckpoint { positionSeconds: number; shouldResume: boolean; }

const DEFAULT_GAME_DOCK_POSITION: DockPosition = { x: 16, y: 16 };
const DEFAULT_VIDEO_DOCK_POSITION: DockPosition = { x: 16, y: 64 };
const DEFAULT_VIDEO_PLAYBACK_CHECKPOINT: VideoPlaybackCheckpoint = { positionSeconds: 0, shouldResume: false };
const MIN_VISIBLE_DOCK_WIDTH = 260;

interface TeachingWorkspaceSnapshot {
  selectedPlanId: string | null;
  selectedItemId: string | null;
  contentMode: ContentMode;
  gameDockOpen: boolean;
  gameDockMinimized: boolean;
  gameDockPosition: DockPosition;
  videoMaterialId: string | null;
  videoDockMinimized: boolean;
  videoDockPosition: DockPosition;
  videoPlayback: VideoPlaybackCheckpoint;
}

const CONTENT_MODE_LABELS: Record<ContentMode, string> = {
  slides: '📊 Trang chiếu',
  video: '🎬 Video',
  links: '🔗 Tài liệu',
  game: '🎮 Game',
};

function workspaceStorageKey(classId: string, subjectId: string): string {
  return `smartlecture:teaching-workspace:${classId}:${subjectId}`;
}

function readDockPosition(value: unknown, fallback: DockPosition): DockPosition {
  if (!value || typeof value !== 'object') return fallback;
  const candidate = value as Partial<DockPosition>;
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return fallback;
  return { x: Math.max(0, candidate.x!), y: Math.max(0, candidate.y!) };
}

function clampDockPosition(position: DockPosition, headerHeight: number): DockPosition {
  return {
    x: Math.max(0, Math.min(window.innerWidth - MIN_VISIBLE_DOCK_WIDTH, position.x)),
    y: Math.max(0, Math.min(window.innerHeight - headerHeight, position.y)),
  };
}

function readVideoPlaybackCheckpoint(value: unknown): VideoPlaybackCheckpoint {
  if (!value || typeof value !== 'object') return DEFAULT_VIDEO_PLAYBACK_CHECKPOINT;
  const candidate = value as Partial<VideoPlaybackCheckpoint>;
  return {
    positionSeconds: Number.isFinite(candidate.positionSeconds) ? Math.max(0, candidate.positionSeconds!) : 0,
    shouldResume: candidate.shouldResume === true,
  };
}

function readWorkspaceSnapshot(classId: string, subjectId: string): TeachingWorkspaceSnapshot | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(workspaceStorageKey(classId, subjectId)) ?? 'null') as Partial<TeachingWorkspaceSnapshot> | null;
    if (!parsed || !['slides', 'video', 'links', 'game'].includes(String(parsed.contentMode))) return null;
    return {
      selectedPlanId: typeof parsed.selectedPlanId === 'string' ? parsed.selectedPlanId : null,
      selectedItemId: typeof parsed.selectedItemId === 'string' ? parsed.selectedItemId : null,
      contentMode: parsed.contentMode as ContentMode,
      gameDockOpen: parsed.gameDockOpen === true,
      gameDockMinimized: parsed.gameDockMinimized === true,
      gameDockPosition: readDockPosition(parsed.gameDockPosition, DEFAULT_GAME_DOCK_POSITION),
      videoMaterialId: typeof parsed.videoMaterialId === 'string' ? parsed.videoMaterialId : null,
      videoDockMinimized: parsed.videoDockMinimized === true,
      videoDockPosition: readDockPosition(parsed.videoDockPosition, DEFAULT_VIDEO_DOCK_POSITION),
      videoPlayback: readVideoPlaybackCheckpoint(parsed.videoPlayback),
    };
  } catch { return null; }
}

function getTeachingMaterialsByType(lecture: TeachingLecture | null, type: ContentMode) {
  if (!lecture) return [];
  const materials = lecture.materials as TeachingMaterial[];
  switch (type) {
    case 'slides':
      return materials.filter((material) => (material.type === 'pptx' || material.type === 'pdf') && !material.convertedFromId);
    case 'video':
      return materials.filter((material) => material.type === 'video');
    case 'links':
      return materials.filter((material) => material.type === 'link');
    default:
      return [];
  }
}

function getConvertedSibling(lecture: TeachingLecture | null, materialId: string) {
  if (!lecture) return null;
  const materials = lecture.materials as TeachingMaterial[];
  return materials.find((material) => material.convertedFromId === materialId) ?? null;
}

export default function TeachingModePage() {
  const { id, subjectId } = useParams<{ id: string; subjectId: string }>();
  const classId = id ?? '';
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [subject, setSubject] = useState<Subject | null>(null);
  const [plans, setPlans] = useState<TeachingPlan[]>([]);
  const [lectures, setLectures] = useState<TeachingLecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [contentMode, setContentMode] = useState<ContentMode>('slides');
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [gameDockOpen, setGameDockOpen] = useState(false);
  const [gameDockMinimized, setGameDockMinimized] = useState(false);
  const [gameDockPosition, setGameDockPosition] = useState<DockPosition>(DEFAULT_GAME_DOCK_POSITION);
  const [videoDockMaterial, setVideoDockMaterial] = useState<TeachingMaterial | null>(null);
  const [videoDockMinimized, setVideoDockMinimized] = useState(false);
  const [videoDockPosition, setVideoDockPosition] = useState<DockPosition>(DEFAULT_VIDEO_DOCK_POSITION);
  const [videoPlayback, setVideoPlayback] = useState<VideoPlaybackCheckpoint>(DEFAULT_VIDEO_PLAYBACK_CHECKPOINT);
  const [activeLog, setActiveLog] = useState<TeachingLog | null>(null);
  const [finishModalOpen, setFinishModalOpen] = useState(false);
  const workspaceRestoredRef = useRef(false);

  const canManage = !!user && (user.role === 'admin' || user.role === 'teacher');

  const loadData = useCallback(async () => {
    if (!classId || !subjectId) return;
    setLoading(true);
    try {
      const [subjectsRes, plansRes, lecturesRes, activeLogRes] = await Promise.all([
        api<{ subjects: Subject[] }>(`/classes/${classId}/subjects`),
        api<{ plans: TeachingPlan[] }>(`/classes/${classId}/teaching-plans`),
        api<{ lectures: TeachingLecture[] }>(`/classes/${classId}/lectures`),
        canManage ? api<{ log: TeachingLog | null }>(`/classes/${classId}/teaching-logs/active`) : Promise.resolve({ log: null }),
      ]);
      setSubject(subjectsRes.subjects.find((s) => s.id === subjectId) ?? null);
      const subjectPlans = plansRes.plans.filter((p) => p.subjectId === subjectId);
      const subjectLectures = lecturesRes.lectures.filter((l) => l.subjectId === subjectId);
      const snapshot = workspaceRestoredRef.current ? null : readWorkspaceSnapshot(classId, subjectId);
      setPlans(subjectPlans);
      setLectures(subjectLectures);
      setActiveLog(activeLogRes.log);
      setSelectedPlanId((prev) => (prev && subjectPlans.some((p) => p.id === prev) ? prev : snapshot?.selectedPlanId && subjectPlans.some((p) => p.id === snapshot.selectedPlanId) ? snapshot.selectedPlanId : subjectPlans[0]?.id ?? null));
      if (!workspaceRestoredRef.current) {
        const itemIds = new Set(subjectPlans.flatMap((plan) => plan.items.map((item) => item.id)));
        setSelectedItemId(snapshot?.selectedItemId && itemIds.has(snapshot.selectedItemId) ? snapshot.selectedItemId : null);
        setContentMode(snapshot?.contentMode ?? 'slides');
        setGameDockOpen(snapshot?.gameDockOpen === true);
        setGameDockMinimized(snapshot?.gameDockMinimized === true);
        setGameDockPosition(clampDockPosition(snapshot?.gameDockPosition ?? DEFAULT_GAME_DOCK_POSITION, 48));
        const savedVideo = snapshot?.videoMaterialId ? subjectLectures.flatMap((lecture) => lecture.materials as TeachingMaterial[]).find((material) => material.id === snapshot.videoMaterialId && material.type === 'video') ?? null : null;
        setVideoDockMaterial(savedVideo);
        setVideoDockMinimized(snapshot?.videoDockMinimized === true);
        setVideoDockPosition(clampDockPosition(snapshot?.videoDockPosition ?? DEFAULT_VIDEO_DOCK_POSITION, 40));
        setVideoPlayback(savedVideo ? snapshot?.videoPlayback ?? DEFAULT_VIDEO_PLAYBACK_CHECKPOINT : DEFAULT_VIDEO_PLAYBACK_CHECKPOINT);
        workspaceRestoredRef.current = true;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [canManage, classId, subjectId]);

  useEffect(() => { workspaceRestoredRef.current = false; }, [classId, subjectId]);
  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    if (!workspaceRestoredRef.current || !classId || !subjectId) return;
    const snapshot: TeachingWorkspaceSnapshot = {
      selectedPlanId, selectedItemId, contentMode, gameDockOpen, gameDockMinimized, gameDockPosition, videoMaterialId: videoDockMaterial?.id ?? null, videoDockMinimized, videoDockPosition, videoPlayback,
    };
    sessionStorage.setItem(workspaceStorageKey(classId, subjectId), JSON.stringify(snapshot));
  }, [classId, subjectId, selectedPlanId, selectedItemId, contentMode, gameDockOpen, gameDockMinimized, gameDockPosition, videoDockMaterial, videoDockMinimized, videoDockPosition, videoPlayback]);
  useEffect(() => {
    const keepDocksVisible = () => {
      setGameDockPosition((position) => clampDockPosition(position, 48));
      setVideoDockPosition((position) => clampDockPosition(position, 40));
    };
    window.addEventListener('resize', keepDocksVisible);
    window.visualViewport?.addEventListener('resize', keepDocksVisible);
    return () => {
      window.removeEventListener('resize', keepDocksVisible);
      window.visualViewport?.removeEventListener('resize', keepDocksVisible);
    };
  }, []);

  async function updateItemStatus(itemId: string, status: CurriculumItem['status']) {
    try {
      await api(`/curriculum-items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function startTeachingSession() {
    const item = getSelectedItem();
    const selectedPlan = getSelectedPlan();
    if (!item || !selectedPlan) {
      toast.error('Chọn mục chương trình trước khi bắt đầu tiết học');
      return;
    }
    try {
      const result = await api<{ id: string; resumed: boolean; log?: TeachingLog }>('/teaching-logs/start', {
        method: 'POST',
        body: JSON.stringify({ classId, subjectId, curriculumItemId: item.id }),
      });
      if (result.log) setActiveLog(result.log);
      else {
        const current = await api<{ log: TeachingLog | null }>(`/classes/${classId}/teaching-logs/active`);
        setActiveLog(current.log);
      }
      if (item.status === 'pending') await updateItemStatus(item.id, 'in_progress');
      toast.success(result.resumed ? 'Đã tiếp tục phiên dạy đang mở' : 'Đã bắt đầu phiên dạy');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể bắt đầu phiên dạy');
    }
  }

  async function recordTeachingAction(kind: 'slide' | 'video' | 'game', id: string) {
    if (!activeLog) return;
    try {
      const result = await api<{ values: string[] }>(`/teaching-logs/${activeLog.id}/actions`, {
        method: 'POST', body: JSON.stringify({ kind, id }),
      });
      setActiveLog((current) => current ? {
        ...current,
        slidesShown: kind === 'slide' ? result.values : current.slidesShown,
        videosPlayed: kind === 'video' ? result.values : current.videosPlayed,
        gamesRun: kind === 'game' ? result.values : current.gamesRun,
      } : current);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể ghi nhận hoạt động');
    }
  }

  async function linkAttendanceToSession(attendanceSessionId: string) {
    if (!activeLog) return;
    try {
      await api(`/teaching-logs/${activeLog.id}`, {
        method: 'PATCH', body: JSON.stringify({ attendanceSessionId, attendanceTaken: true }),
      });
      setActiveLog((current) => current ? { ...current, attendanceSessionId, attendanceTaken: true } : current);
      toast.success('Đã liên kết điểm danh vào phiên dạy');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể liên kết điểm danh');
    }
  }

  function getSelectedPlan() {
    return plans.find((p) => p.id === selectedPlanId);
  }

  function getSelectedItem() {
    const plan = getSelectedPlan();
    if (!plan) return null;
    return plan.items.find((it) => it.id === selectedItemId) ?? plan.items[0] ?? null;
  }

  function getLinkedLecture(item: CurriculumItem) {
    if (!item.lectureId) return null;
    return lectures.find((l) => l.id === item.lectureId) ?? null;
  }

  if (loading) return <div className="flex h-screen items-center justify-center bg-slate-900"><Spinner /></div>;

  const plan = getSelectedPlan();
  const selectedItem = getSelectedItem();
  const linkedLecture = selectedItem ? getLinkedLecture(selectedItem) : null;
  const teachingMaterials = linkedLecture ? getTeachingMaterialsByType(linkedLecture, contentMode) : [];
  const videoMaterials = linkedLecture ? getTeachingMaterialsByType(linkedLecture, 'video') : [];

  return (
    <div className="flex h-screen flex-col bg-slate-900">
      <TeachingHeader
        subject={subject}
        plan={plan}
        plans={plans}
        selectedPlanId={selectedPlanId}
        onExit={() => navigate('/teaching')}
        onPlanChange={(nextPlanId) => { setSelectedPlanId(nextPlanId); setSelectedItemId(null); }}
      />
      <TeachingSessionStrip log={activeLog} onStart={() => void startTeachingSession()} onFinish={() => setFinishModalOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <CurriculumSidebar plan={plan} selectedItemId={selectedItemId} onSelect={setSelectedItemId} />
        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex h-12 shrink-0 items-center border-b border-slate-700 px-4">
            <h3 className="truncate font-medium text-white">
              {selectedItem ? `${selectedItem.week ? `Tuần ${selectedItem.week} — ` : ''}${selectedItem.topic}` : 'Chọn mục chương trình để bắt đầu'}
            </h3>
          </div>
          <TeachingContentViewer
            selectedItem={selectedItem}
            lecture={linkedLecture}
            materials={teachingMaterials}
            contentMode={contentMode}
            token={token}
            onRefresh={loadData}
          />
          <TeachingControls
            contentMode={contentMode}
            gameDockOpen={gameDockOpen}
            gameDockMinimized={gameDockMinimized}
            selectedItem={selectedItem}
            canManage={canManage}
            onModeChange={(nextMode) => {
              if (nextMode === 'game') {
                setGameDockOpen(true); setGameDockMinimized(false);
                return;
              }
              if (nextMode === 'video') {
                const video = videoMaterials[0];
                if (video) { setVideoDockMaterial(video); setVideoDockMinimized(false); setVideoPlayback(DEFAULT_VIDEO_PLAYBACK_CHECKPOINT); void recordTeachingAction('video', video.id); }
                return;
              }
              const actionKind = nextMode === 'slides' ? 'slide' : null;
              if (actionKind) teachingMaterials.forEach((material) => void recordTeachingAction(actionKind, material.id));
              setContentMode(nextMode);
            }}
            onStatusChange={(status) => selectedItem && void updateItemStatus(selectedItem.id, status)}
            onOpenAttendance={() => setSessionModalOpen(true)}
          />
        </main>
      </div>
      {sessionModalOpen && selectedItem && (
        <CreateSessionModal
          classId={classId}
          initialTeachingPlanItemId={selectedItem.id}
          onClose={() => setSessionModalOpen(false)}
          onCreated={async (attendanceSessionId) => {
            await linkAttendanceToSession(attendanceSessionId);
            toast.success('Đã tạo buổi điểm danh — chuyển sang tab Điểm danh để ghi nhận');
          }}
        />
      )}
      {gameDockOpen && (
        <TeachingGameDock
          classId={classId}
          subjectId={subjectId ?? ''}
          minimized={gameDockMinimized}
          position={gameDockPosition}
          onPositionChange={setGameDockPosition}
          onToggleMinimized={() => setGameDockMinimized((value) => !value)}
          onClose={() => setGameDockOpen(false)}
          onGameLaunched={(gameId) => void recordTeachingAction('game', gameId)}
        />
      )}
      {videoDockMaterial && <TeachingVideoDock material={videoDockMaterial} token={token} minimized={videoDockMinimized} position={videoDockPosition} playback={videoPlayback} onPlaybackChange={setVideoPlayback} onPositionChange={setVideoDockPosition} onToggleMinimized={() => setVideoDockMinimized((value) => !value)} onClose={() => { setVideoDockMaterial(null); setVideoDockMinimized(false); setVideoPlayback(DEFAULT_VIDEO_PLAYBACK_CHECKPOINT); }} />}
      {finishModalOpen && activeLog && (
        <FinishSessionModal
          log={activeLog}
          onClose={() => setFinishModalOpen(false)}
          onFinish={async (notes) => {
            await api(`/teaching-logs/${activeLog.id}`, { method: 'PATCH', body: JSON.stringify({ endedAt: new Date().toISOString(), notes }) });
            setActiveLog(null);
            setFinishModalOpen(false);
            toast.success('Đã kết thúc và lưu tổng kết phiên dạy');
          }}
        />
      )}
    </div>
  );
}

function TeachingHeader({
  subject,
  plan,
  plans,
  selectedPlanId,
  onExit,
  onPlanChange,
}: {
  subject: Subject | null;
  plan: TeachingPlan | undefined;
  plans: TeachingPlan[];
  selectedPlanId: string | null;
  onExit: () => void;
  onPlanChange: (planId: string | null) => void;
}) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-700 bg-slate-800 px-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" className="!py-1.5 !text-slate-300 hover:!bg-slate-700" onClick={onExit}>← Thoát</Button>
        <div>
          <h3 className="font-semibold leading-tight text-white">{subject?.name ?? 'Chế độ giảng dạy'}</h3>
          {plan && <p className="text-xs leading-tight text-slate-400">{plan.name}</p>}
        </div>
      </div>
      <Select value={selectedPlanId ?? ''} onChange={(event) => onPlanChange(event.target.value || null)} className="w-64 !border-slate-600 !bg-slate-700 !text-white">
        <option value="">— Chọn chương trình —</option>
        {plans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </Select>
    </div>
  );
}

function TeachingSessionStrip({ log, onStart, onFinish }: { log: TeachingLog | null; onStart: () => void; onFinish: () => void }) {
  if (!log) {
    return (
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-700/40 bg-amber-950/40 px-4 py-2 text-sm text-amber-100">
        <span><i className="fas fa-circle-info mr-2" />Chưa có phiên dạy đang mở. Bắt đầu để lưu tiến độ, tài liệu và điểm danh.</span>
        <Button variant="primary" className="!py-1.5" onClick={onStart}>Bắt đầu phiên dạy</Button>
      </div>
    );
  }
  const started = new Date(log.startedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-emerald-700/40 bg-emerald-950/35 px-4 py-2 text-sm text-emerald-100">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-bold"><i className="fas fa-circle-play mr-2 text-emerald-400" />Đang dạy từ {started}</span>
        <span>{log.slidesShown.length} nội dung trình chiếu</span>
        <span>{log.videosPlayed.length} video</span>
        <span>{log.gamesRun.length} hoạt động game</span>
        <span>{log.attendanceTaken ? 'Đã liên kết điểm danh' : 'Chưa điểm danh'}</span>
      </div>
      <Button variant="secondary" className="!py-1.5" onClick={onFinish}>Kết thúc & tổng kết</Button>
    </div>
  );
}

function CurriculumSidebar({ plan, selectedItemId, onSelect }: { plan: TeachingPlan | undefined; selectedItemId: string | null; onSelect: (itemId: string) => void }) {
  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-700 bg-slate-800">
      <div className="border-b border-slate-700 p-3">
        <h5 className="font-semibold text-white">{plan?.name}</h5>
        <p className="mt-1 text-xs text-slate-400">{plan?.items.length ?? 0} mục · {plan?.totalPeriods ?? 0} tiết</p>
      </div>
      <ul className="space-y-1 p-2">
        {plan?.items.map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => onSelect(item.id)} className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors ${selectedItemId === item.id ? 'bg-blue-900/50 text-white' : 'text-slate-300 hover:bg-slate-700'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${item.status === 'completed' ? 'bg-emerald-500 text-white' : item.status === 'in_progress' ? 'bg-blue-500 text-white' : 'bg-slate-600 text-slate-400'}`}>
                {item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '▶' : item.sortOrder + 1}
              </span>
              <span className="flex-1 truncate">{item.week ? `T${item.week} ` : ''}{item.topic}</span>
              {item.lectureId && <i className="fas fa-link text-xs text-slate-500" title="Đã liên kết bài giảng" />}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function TeachingContentViewer({
  selectedItem,
  lecture,
  materials,
  contentMode,
  token,
  onRefresh,
}: {
  selectedItem: CurriculumItem | null;
  lecture: TeachingLecture | null;
  materials: TeachingMaterial[];
  contentMode: ContentMode;
  token: string | null;
  onRefresh: () => Promise<void>;
}) {
  if (!selectedItem || !lecture) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-950 p-6">
        <div className="py-12 text-center text-slate-500">
          <i className="fas fa-chalkboard-teacher mb-2 text-4xl" />
          <p>{selectedItem ? 'Mục này chưa liên kết bài giảng' : 'Chọn chương trình và mục chương trình để bắt đầu'}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-950 p-6">
      <div className="w-full max-w-4xl">
        {contentMode === 'slides' && materials.length > 0 && <SlidesContent lecture={lecture} materials={materials} token={token} onRefresh={onRefresh} />}
        {contentMode === 'video' && materials.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-sm uppercase tracking-wide text-slate-400">Video</h4>
            {materials.map((material) => (
              <div key={material.id} className="rounded-lg border border-slate-700 bg-slate-800 p-4">
                <h5 className="mb-2 font-medium text-white">{material.title}</h5>
                <video src={`/api/media/${material.id}/stream?token=${encodeURIComponent(token ?? '')}`} controls className="w-full rounded bg-black" />
              </div>
            ))}
          </div>
        )}
        {contentMode === 'links' && materials.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm uppercase tracking-wide text-slate-400">Liên kết & Tài liệu</h4>
            {materials.map((material) => (
              <a key={material.id} href={material.linkUrl ?? `/api/media/${material.id}/stream?token=${encodeURIComponent(token ?? '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 transition hover:border-blue-500">
                <i className={`fas ${material.type === 'link' ? 'fa-external-link-alt' : 'fa-file'} text-blue-400`} />
                <span className="flex-1 truncate text-white">{material.title}</span>
                <i className="fas fa-arrow-up-right-from-square text-xs text-slate-500" />
              </a>
            ))}
          </div>
        )}
        {(contentMode === 'slides' || contentMode === 'video') && materials.length === 0 && (
          <div className="py-12 text-center text-slate-500"><i className="fas fa-inbox mb-2 text-4xl" /><p>Bài giảng "{lecture.title}" chưa có tài liệu loại này</p></div>
        )}
      </div>
    </div>
  );
}

function SlidesContent({ lecture, materials, token, onRefresh }: { lecture: TeachingLecture; materials: TeachingMaterial[]; token: string | null; onRefresh: () => Promise<void> }) {
  const [convertingMaterialId, setConvertingMaterialId] = useState<string | null>(null);
  async function convertPowerPoint(material: TeachingMaterial) {
    setConvertingMaterialId(material.id);
    try {
      await api<{ status: 'ready'; convertedMaterialId: string }>(`/materials/${material.id}/convert-pptx`, { method: 'POST' });
      await onRefresh();
      toast.success('Đã chuyển PowerPoint sang PDF. Bạn có thể chú thích trực tiếp trên bản trình chiếu.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không thể chuyển đổi PowerPoint'); }
    finally { setConvertingMaterialId(null); }
  }
  return (
    <div className="space-y-4">
      <h4 className="text-sm uppercase tracking-wide text-slate-400">Trang chiếu (PPTX/PDF)</h4>
      {materials.map((material) => {
        const sibling = material.type === 'pptx' ? getConvertedSibling(lecture, material.id) : null;
        const inlineTarget = sibling ?? material;
        const streamUrl = `/api/media/${inlineTarget.id}/stream?token=${encodeURIComponent(token ?? '')}`;
        return (
          <div key={material.id} className="rounded-lg border border-slate-700 bg-slate-800 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-white">{material.title}</span>
              <div className="flex items-center gap-3">
                {sibling && <a href={`/api/media/${material.id}/stream?token=${encodeURIComponent(token ?? '')}`} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300">Mở bản gốc PowerPoint</a>}
                <a href={streamUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300">Mở toàn màn hình →</a>
              </div>
            </div>
            {inlineTarget.type === 'pdf' ? (
              <PresentationCanvas title={material.title} sourceUrl={streamUrl} />
            ) : (
              <div className="flex h-32 flex-col items-center justify-center gap-1 rounded border border-dashed border-slate-600 text-sm text-slate-400"><span>Không thể xem trước PowerPoint trực tiếp</span><span className="text-xs">Dùng “Mở toàn màn hình” để mở tệp gốc</span></div>
            )}
            {material.type === 'pptx' && !sibling && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"><span>Chuyển sang PDF để dùng bút, highlight, laser và điều hướng trang ngay trong lớp học.</span><Button variant="secondary" className="!py-1" disabled={convertingMaterialId === material.id} onClick={() => void convertPowerPoint(material)}>{convertingMaterialId === material.id ? 'Đang chuyển đổi…' : 'Chuyển sang PDF'}</Button></div>}
          </div>
        );
      })}
    </div>
  );
}

function TeachingControls({
  contentMode,
  gameDockOpen,
  gameDockMinimized,
  selectedItem,
  canManage,
  onModeChange,
  onStatusChange,
  onOpenAttendance,
}: {
  contentMode: ContentMode;
  gameDockOpen: boolean;
  gameDockMinimized: boolean;
  selectedItem: CurriculumItem | null;
  canManage: boolean;
  onModeChange: (mode: ContentMode) => void;
  onStatusChange: (status: CurriculumItem['status']) => void;
  onOpenAttendance: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-700 bg-slate-800 p-3">
      <div className="flex gap-1">
        {(Object.keys(CONTENT_MODE_LABELS) as ContentMode[]).map((mode) => (
          <button key={mode} aria-label={`Mở ${CONTENT_MODE_LABELS[mode]}`} onClick={() => onModeChange(mode)} className={`rounded px-3 py-1.5 text-xs font-medium transition ${mode === 'game' ? gameDockOpen && !gameDockMinimized ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600' : contentMode === mode ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{CONTENT_MODE_LABELS[mode]}</button>
        ))}
      </div>
      {selectedItem && canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedItem.status} onChange={(event) => onStatusChange(event.target.value as CurriculumItem['status'])} className="w-36 !border-slate-600 !bg-slate-700 !text-white"><option value="pending">Chờ</option><option value="in_progress">Đang dạy</option><option value="completed">Hoàn thành</option></Select>
          <Button variant={selectedItem.status === 'in_progress' ? 'secondary' : 'primary'} onClick={() => onStatusChange('in_progress')} className="!py-1.5">Bắt đầu dạy</Button>
          <Button variant={selectedItem.status === 'completed' ? 'primary' : 'secondary'} onClick={() => onStatusChange('completed')} className="!py-1.5">Hoàn thành</Button>
          <Button variant="ghost" className="!py-1.5 !text-slate-300 hover:!bg-slate-700" onClick={onOpenAttendance}><i className="fas fa-calendar-plus" /> Điểm danh buổi này</Button>
        </div>
      )}
    </div>
  );
}

function TeachingGameDock({ classId, subjectId, minimized, position, onPositionChange, onToggleMinimized, onClose, onGameLaunched }: { classId: string; subjectId: string; minimized: boolean; position: DockPosition; onPositionChange: (position: DockPosition) => void; onToggleMinimized: () => void; onClose: () => void; onGameLaunched: (gameId: string) => void }) {
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const dragStart = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    dragRef.current = { x: event.clientX - position.x, y: event.clientY - position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current; if (!drag) return;
    onPositionChange(clampDockPosition({ x: event.clientX - drag.x, y: event.clientY - drag.y }, 48));
  };
  return (
    <div style={{ left: position.x, top: position.y }} className={`fixed z-[60] overflow-hidden rounded-lg border border-blue-400 bg-slate-950 shadow-2xl transition-[height,width] duration-300 ${minimized ? 'h-12 w-64' : 'h-[min(78vh,720px)] w-[min(94vw,1100px)]'}`}>
      <div aria-label="Kéo khung game" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} className="flex h-12 cursor-move touch-none items-center justify-between bg-blue-900 px-3 text-white">
        <span className="text-sm font-black"><i className="fas fa-gamepad mr-2 text-amber-300" />Game đang chuẩn bị / điều hành</span>
        <div className="flex gap-1">
          <button onClick={onToggleMinimized} className="rounded px-2 py-1 text-xs hover:bg-white/15" title={minimized ? 'Mở lại game' : 'Hạ game xuống'}><i className={`fas ${minimized ? 'fa-up-right-and-down-left-from-center' : 'fa-window-minimize'}`} /></button>
          <button onClick={() => { if (window.confirm('Đóng khung game? Phiên game trên máy chủ vẫn tiếp tục.')) onClose(); }} className="rounded px-2 py-1 text-xs hover:bg-white/15" title="Đóng game"><i className="fas fa-xmark" /></button>
        </div>
      </div>
      <div className="h-[calc(100%-3rem)] overflow-y-auto bg-slate-50 p-3"><Suspense fallback={<Spinner />}><EmbeddedGamesPage initialClassId={classId} initialSubjectId={subjectId} lockedClassId={classId} autoShowGuides={false} onGameLaunched={(game) => onGameLaunched(game.id)} /></Suspense></div>
    </div>
  );
}

function formatPlaybackTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

function TeachingVideoDock({ material, token, minimized, position, playback, onPlaybackChange, onPositionChange, onToggleMinimized, onClose }: { material: TeachingMaterial; token: string | null; minimized: boolean; position: DockPosition; playback: VideoPlaybackCheckpoint; onPlaybackChange: (checkpoint: VideoPlaybackCheckpoint) => void; onPositionChange: (position: DockPosition) => void; onToggleMinimized: () => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resumeNeedsGesture, setResumeNeedsGesture] = useState(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const restoredRef = useRef(false);
  const lastCheckpointRef = useRef(-1);
  const checkpoint = (shouldResume: boolean, force = false) => {
    const positionSeconds = videoRef.current?.currentTime ?? playback.positionSeconds;
    if (!force && Math.abs(positionSeconds - lastCheckpointRef.current) < 5 && shouldResume === playback.shouldResume) return;
    lastCheckpointRef.current = positionSeconds;
    onPlaybackChange({ positionSeconds: Number.isFinite(positionSeconds) ? Math.max(0, positionSeconds) : 0, shouldResume });
  };
  const continuePlayback = async () => {
    try {
      await videoRef.current?.play();
      setResumeNeedsGesture(false);
    } catch {
      setResumeNeedsGesture(true);
      toast.info('Trình duyệt cần thao tác trực tiếp để tiếp tục video có âm thanh.');
    }
  };
  const restorePlayback = () => {
    const video = videoRef.current;
    if (!video || restoredRef.current) return;
    restoredRef.current = true;
    if (playback.positionSeconds > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(playback.positionSeconds, Math.max(0, video.duration - 0.1));
    if (playback.shouldResume) void continuePlayback();
  };
  const requestPiP = async () => {
    try { await videoRef.current?.requestPictureInPicture(); }
    catch { toast.info('Trình duyệt không hỗ trợ Picture-in-Picture; dùng khung video thu nhỏ.'); }
  };
  return <div aria-label="Trình phát video nổi" style={{ left: position.x, top: position.y }} className={`fixed z-[60] overflow-hidden rounded-lg border border-rose-400 bg-black shadow-2xl ${minimized ? 'w-64' : 'w-[min(92vw,560px)]'}`}>
    <div aria-label="Kéo khung video" onPointerDown={(event) => { if (!(event.target as HTMLElement).closest('button')) { dragRef.current = { x: event.clientX - position.x, y: event.clientY - position.y }; event.currentTarget.setPointerCapture(event.pointerId); } }} onPointerMove={(event) => { const drag = dragRef.current; if (drag) onPositionChange(clampDockPosition({ x: event.clientX - drag.x, y: event.clientY - drag.y }, 40)); }} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} className="flex h-10 cursor-move touch-none items-center justify-between bg-rose-900 px-3 text-sm text-white"><span className="truncate">🎬 {material.title}{minimized && <span className="ml-2 text-[10px] text-rose-100">{isPlaying ? 'Đang phát nền' : resumeNeedsGesture ? `Tiếp tục từ ${formatPlaybackTime(playback.positionSeconds)}` : 'Đã thu nhỏ'}</span>}</span><div className="flex gap-1"><button type="button" onClick={onToggleMinimized} aria-label={minimized ? 'Mở rộng video' : 'Thu nhỏ video'} className="rounded px-2 hover:bg-white/15">{minimized ? '+' : '−'}</button>{resumeNeedsGesture && <button type="button" onClick={() => void continuePlayback()} aria-label="Tiếp tục video đã khôi phục" className="rounded px-2 text-xs hover:bg-white/15">Tiếp tục</button>}<button type="button" onClick={() => void requestPiP()} aria-label="Picture in Picture" className="rounded px-2 hover:bg-white/15">PiP</button><button type="button" onClick={onClose} aria-label="Đóng video" className="rounded px-2 hover:bg-white/15">×</button></div></div>
    <video ref={videoRef} src={`/api/media/${material.id}/stream?token=${encodeURIComponent(token ?? '')}`} controls autoPlay onLoadedMetadata={restorePlayback} onPlay={() => { setIsPlaying(true); checkpoint(true, true); }} onPause={() => { setIsPlaying(false); checkpoint(false, true); }} onTimeUpdate={() => checkpoint(true)} className={`w-full bg-black ${minimized ? 'pointer-events-none absolute left-0 top-10 h-px w-px opacity-0' : ''}`} />
  </div>;
}

function FinishSessionModal({ log, onClose, onFinish }: { log: TeachingLog; onClose: () => void; onFinish: (notes: string) => Promise<void> }) {
  const [notes, setNotes] = useState(log.notes);
  const [busy, setBusy] = useState(false);
  async function finish() {
    setBusy(true);
    try { await onFinish(notes); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Không thể kết thúc phiên dạy'); }
    finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title="Tổng kết phiên dạy">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
          <span>Trình chiếu: <b>{log.slidesShown.length}</b></span>
          <span>Video: <b>{log.videosPlayed.length}</b></span>
          <span>Game: <b>{log.gamesRun.length}</b></span>
          <span>Điểm danh: <b>{log.attendanceTaken ? 'Đã liên kết' : 'Chưa có'}</b></span>
        </div>
        <div><Label>Ghi chú sau tiết học</Label><textarea aria-label="Ghi chú sau tiết học" className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Nội dung đã hoàn thành, điểm cần ôn tập, việc cần theo dõi…" maxLength={5000} /></div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Hủy</Button><Button onClick={() => void finish()} disabled={busy}>{busy ? 'Đang lưu…' : 'Kết thúc phiên'}</Button></div>
      </div>
    </Modal>
  );
}

function CreateSessionModal({
  classId,
  initialTeachingPlanItemId,
  onClose,
  onCreated,
}: {
  classId: string;
  initialTeachingPlanItemId?: string;
  onClose: () => void;
  onCreated: (attendanceSessionId: string) => Promise<void>;
}) {
  const today = toISODate(new Date());
  const [date, setDate] = useState(today);
  const [periods, setPeriods] = useState(1);
  const [teachingType, setTeachingType] = useState(TEACHING_TYPES[0]!);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const created = await api<{ id: string }>(`/classes/${classId}/attendance/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          date,
          periodsTotal: periods,
          teachingType,
          note: content,
          teachingPlanItemId: initialTeachingPlanItemId ?? undefined,
        }),
      });
      toast.success('Đã tạo buổi học');
      onClose();
      await onCreated(created.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Buổi học mới">
      <div className="space-y-3">
        <div><Label>Ngày</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label>Số tiết</Label><Input type="number" min={1} max={12} value={periods} onChange={(e) => setPeriods(Number(e.target.value))} /></div>
        <div>
          <Label>Loại hình giảng dạy</Label>
          <Select value={teachingType} onChange={(e) => setTeachingType(e.target.value)}>
            {TEACHING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div><Label>Nội dung</Label><Input value={content} onChange={(e) => setContent(e.target.value)} placeholder="Ghi chú nội dung buổi học" /></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy}>Tạo buổi học</Button></div>
      </div>
    </Modal>
  );
}
