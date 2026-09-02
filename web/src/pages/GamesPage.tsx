import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { createSocketEventScope, getSocket, disconnectSocket } from '../realtime/socket';
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, Spinner } from '../components/ui';
import CircuitCanvas, { type CircuitData } from '../components/CircuitCanvas';
import toast from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import { useMyClasses } from './LecturesPage';
import { useFieldReducer, type StateUpdate } from '../hooks/useFieldReducer';

type GameMode =
  | 'quick_quiz' | 'tug_of_war' | 'math_race' | 'hand_raise' | 'crossword'
  | 'bingo' | 'memory_match' | 'word_scramble' | 'quiz_show'
  | 'circuit_draw' | 'circuit_simulate';

interface Question {
  id: string;
  type: string;
  content: string;
  subjectId: string | null;
  chapter: string;
  lesson: string;
}

interface SubjectInfo { id: string; name: string; }

interface PreparedGame {
  id: string;
  gameType: GameMode;
  title: string;
  classId: string | null;
  subjectId: string | null;
  questionIds: string[];
  config: { secondsPerQuestion?: number };
  lastUsedAt: string | null;
}

interface PuzzleRowDraft {
  id: string;
  clue: string;
  word: string;
}

interface SimulationChallengeDraft {
  id: string;
  title: string;
  description: string;
  points: number;
  tpl: CircuitData | null;
}

let draftSequence = 0;

function nextDraftId(prefix: string): string {
  draftSequence += 1;
  return `${prefix}-${draftSequence}`;
}

function createPuzzleRow(): PuzzleRowDraft {
  return { id: nextDraftId('puzzle-row'), clue: '', word: '' };
}

function createSimulationChallenge(): SimulationChallengeDraft {
  return { id: nextDraftId('simulation-challenge'), title: '', description: '', points: 100, tpl: null };
}

export interface GameSessionInfo {
  id: string;
  gameType: string;
  roomCode: string;
  status: string;
  questionCount: number;
  config: { title: string; secondsPerQuestion: number };
}

interface TugTeam {
  name: string;
  members: string[];
  score: number;
}

const MODE_META: Record<GameMode, { label: string; desc: string; icon: string }> = {
  quick_quiz: { label: 'Trắc nghiệm nhanh', desc: 'Cả lớp cùng câu, điểm thưởng tốc độ', icon: 'fa-bolt' },
  tug_of_war: { label: 'Kéo co', desc: '2 đội giằng dây bằng câu trả lời đúng', icon: 'fa-people-pulling' },
  math_race: { label: 'Đua toán', desc: 'Mỗi HV giải càng nhiều càng tốt trong thời gian', icon: 'fa-flag-checkered' },
  hand_raise: { label: 'Giơ tay trả lời', desc: 'HV giơ tay → GV chọn người trả lời → chấm đúng/sai → tự cộng điểm KTTX', icon: 'fa-hand' },
  crossword: { label: 'Ô chữ', desc: 'Giải từng hàng ngang mở dần từ khóa dọc — mỗi ô đúng cộng điểm KTTX', icon: 'fa-puzzle-piece' },
  bingo: { label: 'Bingo số', desc: 'Mỗi HV 1 phiếu 5×5 — GV gọi số, ai đủ 5 hàng trước thắng +KTTX', icon: 'fa-table-cells' },
  memory_match: { label: 'Lật thẻ đôi', desc: 'Đua lật cặp thẻ giống nhau — mỗi cặp đúng +100đ, nhanh tay hơn người khác!', icon: 'fa-clone' },
  word_scramble: { label: 'Xếp chữ', desc: 'Sắp xếp chữ cái lộn xộn thành đáp án đúng từ ngân hàng câu hỏi — càng ít lần thử điểm càng cao', icon: 'fa-shuffle' },
  quiz_show: { label: 'Chiếc nón kỳ diệu', desc: 'Trắc nghiệm có 3 quyền trợ giúp: 50:50, Hỏi khán giả, Gọi điện — chuỗi đúng liên tiếp ghi đậm', icon: 'fa-crown' },
  circuit_draw: { label: 'Vẽ mạch điện', desc: 'HV vẽ mạch trên canvas (nguồn, R/L/C, LED, cổng logic…) → GV chấm đúng/sai → tự cộng KTTX', icon: 'fa-drafting-compass' },
  circuit_simulate: { label: 'Mô phỏng mạch', desc: 'Xây mạch và chạy mô phỏng logic realtime — dây phát sáng theo tín hiệu, kèm oscilloscope', icon: 'fa-microchip' },
};

const NEEDS_QUESTIONS = new Set<GameMode>(['quick_quiz', 'tug_of_war', 'hand_raise', 'word_scramble', 'quiz_show']);
const KTTX_MODES = new Set<GameMode>(['hand_raise', 'crossword', 'word_scramble', 'quiz_show', 'bingo', 'circuit_draw', 'circuit_simulate']);
const USES_SECONDS = new Set<GameMode>(['quick_quiz', 'tug_of_war', 'hand_raise', 'quiz_show', 'circuit_draw', 'circuit_simulate']);
const GAME_GUIDE_PREFERENCE = 'smart-lecture-hide-game-guides';
const FINISHED_AT_FORMATTER = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
const DEFAULT_CIRCUIT_CHALLENGE_GUIDE = [
  { title: 'Đèn LED', observation: 'Bật công tắc để kiểm tra đường tín hiệu HIGH và LED sáng.' },
  { title: 'Cổng AND', observation: 'So sánh LED khi lần lượt bật A, B và cả hai đầu vào.' },
  { title: 'Cổng NOT', observation: 'Quan sát LED đổi trạng thái ngược với công tắc.' },
  { title: 'D Flip-Flop', observation: 'Thay đổi DATA trước/sau cạnh lên CLK; xem Q trên LED và Probe.' },
  { title: 'Half Adder', observation: 'Đối chiếu S (tổng) và C (nhớ) với bốn tổ hợp A/B.' },
  { title: 'Full Adder', observation: 'Dùng A, B, Cin để quan sát S và Cout trên LED/Probe.' },
] as const;

function shouldHideGameGuides(): boolean {
  try { return window.localStorage.getItem(GAME_GUIDE_PREFERENCE) === '1'; }
  catch { return false; }
}

type HostPhase = 'lobby' | 'question' | 'leaderboard' | 'race' | 'crossword' | 'sandbox' | 'finished';

interface CircuitRoomData {
  components: Array<{
    id: string;
    type: string;
    x: number;
    y: number;
    rotation?: number;
    rot?: number;
    properties?: Record<string, unknown>;
    props?: Record<string, unknown>;
  }>;
  wires: Array<{
    id: string;
    from: string;
    to: string;
    fromPort?: string;
    toPort?: string;
  }>;
}

interface CircuitProgressRow {
  userId: string;
  name: string;
  online: boolean;
  status: 'disconnected' | 'completed' | 'working' | 'not_started';
  completedCurrent: boolean;
  completedCount: number;
  totalChallenges: number;
  score: number;
  simulationState: string;
  componentCount: number;
  wireCount: number;
  lastActivityAt: number;
  submissionAttempts: number;
  totalSubmissionAttempts: number;
  incorrectSubmissionAttempts: number;
  lastSubmissionAt: number | null;
  lastValidationCode: 'correct' | 'invalid_data' | 'wire_count' | 'component_count' | 'connection' | null;
  lastValidationFeedback: string | null;
}

interface CircuitLearningDebrief {
  summary: {
    learnerCount: number;
    completedAllCount: number;
    totalCompletions: number;
    totalPossible: number;
    totalSubmissionAttempts: number;
    incorrectSubmissionAttempts: number;
    completionRate: number;
  };
  learners: Array<{
    userId: string;
    name: string;
    completedCount: number;
    totalChallenges: number;
    totalSubmissionAttempts: number;
    incorrectSubmissionAttempts: number;
    score: number;
  }>;
}

interface RecentCircuitDebrief {
  session: GameSessionInfo;
  finishedAt: string | null;
  debrief: CircuitLearningDebrief;
}

interface CircuitInspection extends CircuitProgressRow {
  challengeId: string | null;
  circuit: CircuitRoomData | null;
}

interface CircuitAssistanceStatus {
  userId: string;
  name: string;
  messageId: string;
  kind: 'hint' | 'retry';
  message: string;
  sentAt: number;
  deliveredAt: number | null;
  acknowledgedAt: number | null;
  status: 'queued' | 'delivered' | 'acknowledged';
}

const CIRCUIT_PROGRESS_STATUS: Record<CircuitProgressRow['status'], { label: string; className: string }> = {
  disconnected: { label: 'Mất kết nối', className: 'bg-slate-100 text-slate-500' },
  completed: { label: 'Đã hoàn thành', className: 'bg-emerald-100 text-emerald-700' },
  working: { label: 'Đang thực hiện', className: 'bg-blue-100 text-blue-800' },
  not_started: { label: 'Chưa bắt đầu', className: 'bg-amber-100 text-amber-800' },
};
const CIRCUIT_STUCK_AFTER_MS = 10_000;
type CircuitSupportFilter = 'all' | 'attention' | 'incorrect' | 'pending' | 'offline';

function circuitSupportMeta(row: CircuitProgressRow, assistance: CircuitAssistanceStatus | undefined, now: number) {
  const incorrect = !row.completedCurrent && row.submissionAttempts > 0
    && row.lastValidationCode !== null && row.lastValidationCode !== 'correct';
  const stuck = row.online && row.status === 'working' && now - row.lastActivityAt >= CIRCUIT_STUCK_AFTER_MS;
  const queued = assistance?.status === 'queued';
  const pending = assistance?.status === 'delivered';
  const attention = incorrect || stuck || queued || pending;
  const priority = incorrect ? 0 : stuck ? 1 : queued ? 2 : pending ? 3 : row.status === 'disconnected' ? 4
    : row.status === 'working' ? 5 : row.status === 'not_started' ? 6 : 7;
  return { incorrect, stuck, queued, pending, attention, priority };
}

type CircuitSupportMeta = ReturnType<typeof circuitSupportMeta>;
interface CircuitSupportEntry { row: CircuitProgressRow; meta: CircuitSupportMeta }

function buildCircuitSupportQueue(progress: CircuitProgressRow[], assistance: CircuitAssistanceStatus[], now: number, filter: CircuitSupportFilter) {
  const assistanceByUser = new Map(assistance.map((row) => [row.userId, row]));
  const prioritized: CircuitSupportEntry[] = progress
    .map((row) => ({ row, meta: circuitSupportMeta(row, assistanceByUser.get(row.userId), now) }))
    .toSorted((left, right) => left.meta.priority - right.meta.priority
      || left.row.lastActivityAt - right.row.lastActivityAt
      || left.row.name.localeCompare(right.row.name));
  const counts = {
    attention: prioritized.filter((entry) => entry.meta.attention).length,
    incorrect: prioritized.filter((entry) => entry.meta.incorrect).length,
    pending: prioritized.filter((entry) => entry.meta.pending).length,
    offline: prioritized.filter((entry) => entry.row.status === 'disconnected').length,
  };
  const visible = prioritized.filter((entry) => filter === 'all'
    || (filter === 'attention' && entry.meta.attention)
    || (filter === 'incorrect' && entry.meta.incorrect)
    || (filter === 'pending' && entry.meta.pending)
    || (filter === 'offline' && entry.row.status === 'disconnected'));
  const filterOptions: Array<{ id: CircuitSupportFilter; label: string; count: number }> = [
    { id: 'all', label: 'Tất cả', count: progress.length },
    { id: 'attention', label: 'Cần xử lý', count: counts.attention },
    { id: 'incorrect', label: 'Nộp chưa đạt', count: counts.incorrect },
    { id: 'pending', label: 'Chờ xác nhận', count: counts.pending },
    { id: 'offline', label: 'Ngoại tuyến', count: counts.offline },
  ];
  return { assistanceByUser, prioritized, visible, filterOptions, attentionCount: counts.attention };
}

interface HostConsoleState {
  phase: HostPhase;
  players: { name: string; score?: number; team?: string; userId?: string }[];
  reveal: { correctIdx: number; correctText?: string; counts: number[]; correctCount: number; playerCount: number } | null;
  leaderboard: { name: string; score: number }[];
  ropePos: number;
  teams: { A: TugTeam; B: TugTeam } | null;
  tugResult: { winnerTeam: 'A' | 'B'; teamA: number; teamB: number } | null;
  raceRows: { name: string; solved: number }[];
  raceEndsAt: number;
  tick: number;
  hands: { userId: string; name: string }[];
  picked: { userId: string; name: string } | null;
  hrResult: { name: string; correct: boolean; delta: number; newKttx: number | null } | null;
  cwState: { keywordRevealed: string[]; rows: { index: number; clue: string; wordLen: number; solved: boolean; word: string | null }[]; solvedCount: number; total: number } | null;
  joinQr: string | null;
  bingoLast: number | null;
  bingoCalled: number[];
  bingoWinner: string | null;
  memBoard: { id: number; value: string; matched: boolean }[];
  memPairs: number;
  memFeed: { name: string; ok: boolean; key: number }[];
  scProgress: { userId: string; name: string; solved: number }[];
  qsQ: { content: string; options: string[] } | null;
  qsIdx: number;
  qsTot: number;
  qsReveal: { correctIdx: number; correctText?: string } | null;
  qsScores: { name: string; score: number; streak: number }[];
  cdPending: { userId: string; name: string; circuit: CircuitRoomData }[];
  csChallenge: {
    title: string;
    description: string;
    targetBehavior: string;
    index: number;
    total: number;
    endsAt: number;
    paused: boolean;
    remainingMs: number;
  } | null;
  csPasses: { name: string; points: number; key: number }[];
  csProgress: CircuitProgressRow[];
  csInspection: CircuitInspection | null;
  csAssistance: CircuitAssistanceStatus[];
  circuitDebrief: CircuitLearningDebrief | null;
}

interface HostSyncPayload {
  phase: string;
  players: { name: string; score?: number; team?: string; userId?: string }[];
  leaderboard?: { name: string; score: number }[];
  ropePos: number;
  circuitSimulate?: {
    challenge: {
      title: string;
      description: string;
      targetBehavior: string;
      index: number;
      total: number;
      endsAt: number;
      paused: boolean;
      remainingMs: number;
    };
    passes: { userId: string; name: string; challengeId: string; points: number }[];
    progress: CircuitProgressRow[];
    assistance: CircuitAssistanceStatus[];
  } | null;
}

type HostSetField = <Key extends keyof HostConsoleState>(
  key: Key,
  update: StateUpdate<HostConsoleState[Key]>,
) => void;

function createHostConsoleState(): HostConsoleState {
  return {
    phase: 'lobby', players: [], reveal: null, leaderboard: [], ropePos: 0, teams: null, tugResult: null,
    raceRows: [], raceEndsAt: 0, tick: 0, hands: [], picked: null, hrResult: null, cwState: null, joinQr: null,
    bingoLast: null, bingoCalled: [], bingoWinner: null,
    memBoard: [], memPairs: 0, memFeed: [], scProgress: [],
    qsQ: null, qsIdx: 0, qsTot: 0, qsReveal: null, qsScores: [],
    cdPending: [], csChallenge: null, csPasses: [], csProgress: [], csInspection: null, csAssistance: [], circuitDebrief: null,
  };
}

function toHostPhase(phase: string): HostPhase {
  if (phase === 'lobby' || phase === 'question' || phase === 'leaderboard' || phase === 'race'
    || phase === 'crossword' || phase === 'finished') return phase;
  return 'sandbox';
}

type GameGuide = { gif: string; caption: string; rules: string[]; scoring: string };

const GAME_GUIDES: Record<'quiz' | 'tug' | 'race' | 'activity' | 'crossword' | 'show', GameGuide> = {
  quiz: {
    gif: '/game-guides/quiz-guide.gif',
    caption: 'Cả lớp trả lời cùng lúc trên điện thoại, bảng điểm cập nhật sau mỗi câu.',
    rules: ['Giáo viên mở câu hỏi; học viên chọn đáp án trước khi hết giờ.', 'Trả lời đúng được tính điểm; nhanh hơn sẽ có lợi thế ở các chế độ quiz.', 'Giáo viên xem bảng xếp hạng và chuyển sang câu tiếp theo.'],
    scoring: 'Điểm và tốc độ được hệ thống tổng hợp theo từng câu.',
  },
  tug: {
    gif: '/game-guides/tug-guide.gif',
    caption: 'Hai đội cùng kéo dây bằng số câu trả lời đúng.',
    rules: ['Học viên được chia vào Đội A hoặc Đội B khi vào phòng.', 'Mỗi câu trả lời đúng kéo dây về phía đội mình.', 'Đội chạm mốc cuối dây trước sẽ thắng tuyệt đối.'],
    scoring: 'Kết quả tập thể dựa trên tổng số câu trả lời đúng của đội.',
  },
  race: {
    gif: '/game-guides/race-guide.gif',
    caption: 'Mỗi học viên giải các phép tính riêng trong thời gian giới hạn.',
    rules: ['Giáo viên chọn thời lượng và độ khó trước khi mở phòng.', 'Học viên giải liên tục; trả lời đúng sẽ nhận bài mới.', 'Bảng đua hiển thị số bài đúng theo thời gian thực.'],
    scoring: 'Người giải đúng nhiều nhất khi hết giờ đứng đầu.',
  },
  activity: {
    gif: '/game-guides/activity-guide.gif',
    caption: 'Hoạt động tương tác: giơ tay, ô chữ, ghép thẻ hoặc thử thách mạch.',
    rules: ['Học viên tương tác theo yêu cầu hiển thị trên màn hình.', 'Giáo viên chọn người, chấm đúng/sai hoặc xác nhận bài nộp.', 'Một số chế độ có thể cộng điểm KTTX theo cấu hình trước khi chơi.'],
    scoring: 'Điểm KTTX chỉ được cộng khi giáo viên bật cấu hình và xác nhận kết quả.',
  },
  crossword: {
    gif: '/game-guides/crossword-guide.gif',
    caption: 'Giải từng hàng ngang để mở dần từ khóa dọc.',
    rules: ['Giáo viên tạo từ khóa dọc và các gợi ý hàng ngang trước khi mở phòng.', 'Học viên giơ tay; giáo viên chọn người trả lời một hàng ngang.', 'Trả lời đúng sẽ mở hàng và một chữ cái trên từ khóa dọc.'],
    scoring: 'Mỗi hàng đúng có thể cộng KTTX theo mức giáo viên đã chọn.',
  },
  show: {
    gif: '/game-guides/show-guide.gif',
    caption: 'Trả lời theo chuỗi và dùng trợ giúp vào đúng thời điểm.',
    rules: ['Chọn một đáp án trước khi hết giờ để giữ chuỗi câu đúng.', 'Mỗi học viên có thể dùng 50:50, hỏi khán giả hoặc gọi điện.', 'Trả lời đúng liên tiếp giúp duy trì thứ hạng trên bảng điểm.'],
    scoring: 'Điểm tăng theo chuỗi trả lời đúng; trợ giúp không làm thay đổi đáp án.',
  },
};

function guideFor(mode: GameMode): GameGuide {
  if (mode === 'tug_of_war') return GAME_GUIDES.tug;
  if (mode === 'math_race') return GAME_GUIDES.race;
  if (mode === 'crossword') return GAME_GUIDES.crossword;
  if (mode === 'quiz_show') return GAME_GUIDES.show;
  if (['quick_quiz', 'word_scramble', 'bingo', 'memory_match'].includes(mode)) return GAME_GUIDES.quiz;
  return GAME_GUIDES.activity;
}

export default function GamesPage({
  initialClassId = '',
  initialSubjectId = '',
  lockedClassId = '',
  autoShowGuides = true,
  onGameLaunched,
}: {
  initialClassId?: string;
  initialSubjectId?: string;
  lockedClassId?: string;
  autoShowGuides?: boolean;
  onGameLaunched?: (session: GameSessionInfo) => void;
}) {
  const [tab, setTab] = useState<GameMode | 'picker' | 'saved'>('quick_quiz');
  const [session, setSession] = useState<GameSessionInfo | null>(null);
  const [recoveringSession, setRecoveringSession] = useState(() => !lockedClassId);
  const [guideMode, setGuideMode] = useState<GameMode | null>(() => autoShowGuides && !shouldHideGameGuides() ? 'quick_quiz' : null);
  const [recentDebriefs, setRecentDebriefs] = useState<RecentCircuitDebrief[]>([]);
  const [loadingRecentDebriefs, setLoadingRecentDebriefs] = useState(true);

  useEffect(() => {
    if (lockedClassId) return;
    let active = true;
    void api<{ sessions: GameSessionInfo[] }>('/games/mine/active')
      .then(({ sessions }) => {
        if (active && sessions[0]) setSession((current) => current ?? sessions[0] ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setRecoveringSession(false);
      });
    return () => { active = false; };
  }, [lockedClassId]);

  useEffect(() => {
    let active = true;
    const classId = lockedClassId || initialClassId;
    const query = classId ? `?classId=${encodeURIComponent(classId)}&limit=5` : '?limit=5';
    void api<{ reports: RecentCircuitDebrief[] }>(`/games/mine/recent-circuit-debriefs${query}`)
      .then(({ reports }) => {
        if (active) setRecentDebriefs(reports);
      })
      .catch(() => {
        if (active) setRecentDebriefs([]);
      })
      .finally(() => {
        if (active) setLoadingRecentDebriefs(false);
      });
    return () => { active = false; };
  }, [initialClassId, lockedClassId]);

  function launchSession(nextSession: GameSessionInfo) {
    setSession(nextSession);
    onGameLaunched?.(nextSession);
  }

  function selectGame(mode: GameMode) {
    setTab(mode);
    if (autoShowGuides && !shouldHideGameGuides()) setGuideMode(mode);
  }

  function closeGuide(remember = false) {
    if (remember) {
      try { window.localStorage.setItem(GAME_GUIDE_PREFERENCE, '1'); }
      catch { /* local storage can be unavailable in restricted browsers */ }
    }
    setGuideMode(null);
  }

  if (recoveringSession) return <div className="flex min-h-48 items-center justify-center"><Spinner /></div>;
  if (session) return <HostConsole session={session} />;

  return (
    <div>
      <PageHeader title="Trò chơi" subtitle="Kiểm tra bài cũ ngay trên lớp — học viên tham gia bằng tài khoản" actions={
        tab !== 'picker' && tab !== 'saved' ? <Button variant="secondary" onClick={() => setGuideMode(tab)}><i className="fas fa-circle-play" /> Cách chơi</Button> : undefined
      } />
      <RecentCircuitDebriefs reports={recentDebriefs} loading={loadingRecentDebriefs} />
      <div className="mb-5 flex w-fit flex-wrap gap-1 rounded-sm border border-slate-200 bg-white p-1">
        {(Object.keys(MODE_META) as GameMode[]).map((k) => (
          <button key={k} onClick={() => selectGame(k)} className={`flex items-center gap-1.5 rounded-sm px-4 py-2 text-sm font-semibold transition ${tab === k ? 'bg-blue-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
            <i className={`fas ${MODE_META[k].icon}`} /> {MODE_META[k].label}
          </button>
        ))}
        <button onClick={() => setTab('picker')} className={`flex items-center gap-1.5 rounded-sm px-4 py-2 text-sm font-semibold transition ${tab === 'picker' ? 'bg-blue-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
          <i className="fas fa-dice" /> Bốc thăm
        </button>
        <button onClick={() => setTab('saved')} className={`flex items-center gap-1.5 rounded-sm px-4 py-2 text-sm font-semibold transition ${tab === 'saved' ? 'bg-blue-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
          <i className="fas fa-bookmark" /> Lưu sẵn
        </button>
      </div>
      {tab === 'picker' ? (
        <RandomPickerTab />
      ) : tab === 'saved' ? (
        <PreparedGamesTab onLaunched={launchSession} initialClassId={lockedClassId || initialClassId} initialSubjectId={initialSubjectId} lockedClassId={lockedClassId} />
      ) : (
        <>
          <Card className="mb-4 p-4 text-sm text-slate-600">{MODE_META[tab].desc}</Card>
          <CreateGameTab key={tab} mode={tab} initialClassId={lockedClassId || initialClassId} initialSubjectId={initialSubjectId} lockedClassId={lockedClassId} onCreated={launchSession} />
        </>
      )}
      {guideMode && <GameGuideModal mode={guideMode} onClose={closeGuide} />}
    </div>
  );
}

function CreateGameTab({ mode, initialClassId, initialSubjectId, lockedClassId, onCreated }: { mode: GameMode; initialClassId: string; initialSubjectId: string; lockedClassId: string; onCreated: (session: GameSessionInfo) => void }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [secondsPerQuestion, setSeconds] = useState(20);
  const [durationSec, setDurationSec] = useState(120);
  const [difficulty, setDifficulty] = useState(1);
  const [pointsPerCorrect, setPointsPerCorrect] = useState<0.25 | 0.5 | 1>(0.5);
  const [lockOnStart, setLockOnStart] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState(lockedClassId || initialClassId);
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [chapter, setChapter] = useState('');
  const [title, setTitle] = useState(MODE_META[mode].label);
  const classes = useMyClasses();
  const location = useLocation();
  const routeState = location.state as { classId?: string } | null;
  const routeClassId = routeState?.classId ?? new URLSearchParams(location.search).get('classId') ?? '';
  const classId = lockedClassId || selectedClassId || routeClassId || classes[0]?.id || '';
  const [puzzleKeyword, setPuzzleKeyword] = useState('');
  const [puzzleRows, setPuzzleRows] = useState<PuzzleRowDraft[]>(() => [createPuzzleRow(), createPuzzleRow()]);
  const [loading, setLoading] = useState(mode !== 'math_race');
  const [tpl, setTpl] = useState<CircuitData | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [simCh, setSimCh] = useState<SimulationChallengeDraft[]>([]);
  const [simEditIdx, setSimEditIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!NEEDS_QUESTIONS.has(mode)) { setQuestions([]); setLoading(false); return; }
    setLoading(true);
    const params = new URLSearchParams({ limit: '500' });
    if (subjectId) params.set('subjectId', subjectId);
    if (chapter) params.set('chapter', chapter);
    api<{ questions: Question[] }>(`/questions?${params}`)
      .then((r) => setQuestions(r.questions))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [mode, subjectId, chapter]);

  useEffect(() => {
    if (!classId) { setSubjects([]); return; }
    api<{ subjects: SubjectInfo[] }>(`/classes/${classId}/subjects`)
      .then((r) => setSubjects(r.subjects))
      .catch(() => setSubjects([]));
  }, [classId]);

  const chapters = [...new Set(questions.flatMap((question) => question.chapter ? [question.chapter] : []))]
    .sort((a, b) => a.localeCompare(b, 'vi'));

  function selectClass(nextClassId: string) {
    if (lockedClassId) return;
    setSelectedClassId(nextClassId);
    setSubjectId('');
    setChapter('');
  }

  function buildGamePayload(): Record<string, unknown> {
      const body: Record<string, unknown> = {
        gameType: mode,
        title: title.trim() || MODE_META[mode].label,
        questionIds: NEEDS_QUESTIONS.has(mode) ? [...selectedIds] : undefined,
        secondsPerQuestion,
        durationSec,
        difficulty,
        lockOnStart,
        classId: classId || undefined,
        subjectId: subjectId || undefined,
      };
      if (KTTX_MODES.has(mode)) {
        body.pointsPerCorrect = pointsPerCorrect;
      }
      if ((mode === 'circuit_draw' || mode === 'circuit_simulate') && tpl && tpl.components.length > 0) {
        body.circuitTemplate = {
          components: tpl.components.map((c) => ({ id: c.id, type: c.type, x: c.x, y: c.y, rot: c.rot, props: c.props })),
          wires: tpl.wires.map((w) => ({ id: w.id, from: w.from, to: w.to })),
        };
      }
      if (mode === 'circuit_simulate' && simCh.length > 0) {
        const valid = simCh.filter((c) => c.title.trim());
        if (valid.length > 0) {
          body.simulateChallenges = valid.map((c) => ({
            title: c.title.trim(),
            description: c.description.trim(),
            targetBehavior: c.description.trim(),
            points: Math.min(1000, Math.max(10, Math.round(c.points))),
            circuit:
              c.tpl && c.tpl.components.length > 0
                ? {
                    components: c.tpl.components.map((x) => ({ id: x.id, type: x.type, x: x.x, y: x.y, rot: x.rot, props: x.props })),
                    wires: c.tpl.wires.map((w) => ({ id: w.id, from: w.from, to: w.to })),
                  }
                : null,
          }));
        }
      }
      if (mode === 'crossword') {
        body.pointsPerCorrect = pointsPerCorrect;
        body.puzzle = {
          keyword: puzzleKeyword.trim(),
          rows: puzzleRows.map((r) => ({ clue: r.clue.trim(), word: r.word.trim() })),
        };
      }
      return body;
  }

  async function create() {
    try {
      const body = buildGamePayload();
      const res = await api<{ id: string; roomCode: string }>('/games', { method: 'POST', body: JSON.stringify(body) });
      toast.success(`Đã tạo phòng ${res.roomCode}`);
      onCreated({ id: res.id, roomCode: res.roomCode, gameType: mode, status: 'lobby', questionCount: selectedIds.size, config: { title: body.title as string, secondsPerQuestion } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tạo game');
    }
  }

  async function savePrepared() {
    try {
      const body = buildGamePayload();
      await api('/prepared-games', {
        method: 'POST',
        body: JSON.stringify({
          gameType: mode,
          title: body.title,
          classId: classId || null,
          subjectId: subjectId || null,
          questionIds: body.questionIds ?? [],
          config: body,
        }),
      });
      toast.success('Đã lưu game để dùng lại');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu game');
    }
  }

  const crosswordReady = mode !== 'crossword'
    || (
      puzzleKeyword.trim().length > 0
      && puzzleRows.every((row) => row.clue.trim() && row.word.trim())
    );
  const canSubmit = (!NEEDS_QUESTIONS.has(mode) || selectedIds.size > 0) && crosswordReady;
  const editingSimulation = mode === 'circuit_simulate' && simEditIdx !== null
    ? simCh[simEditIdx] ?? null
    : null;
  const canvasData = editingSimulation ? editingSimulation.tpl : tpl;

  function closeTemplateEditor() {
    setTplOpen(false);
    setSimEditIdx(null);
  }

  function updateCanvasData(data: CircuitData) {
    const normalized = { components: data.components, wires: data.wires };
    if (editingSimulation && simEditIdx !== null) {
      setSimCh((items) => items.map((item, index) => index === simEditIdx ? { ...item, tpl: normalized } : item));
    } else {
      setTpl(normalized);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      {NEEDS_QUESTIONS.has(mode) && (
        <QuestionSelectionCard
          questions={questions}
          selectedIds={selectedIds}
          loading={loading}
          onToggle={(questionId, checked) => setSelectedIds((current) => {
            const next = new Set(current);
            if (checked) next.add(questionId); else next.delete(questionId);
            return next;
          })}
        />
      )}

      {mode === 'crossword' && (
        <CrosswordBuilder
          keyword={puzzleKeyword}
          rows={puzzleRows}
          onKeywordChange={setPuzzleKeyword}
          onRowChange={(index, patch) => setPuzzleRows((rows) =>
            rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row)
          )}
          onAddRow={() => setPuzzleRows((rows) => [...rows, createPuzzleRow()])}
          onRemoveRow={() => setPuzzleRows((rows) => rows.slice(0, -1))}
        />
      )}

      <GameSettingsCard
        mode={mode}
        title={title}
        classId={classId}
        classLocked={Boolean(lockedClassId)}
        classes={classes}
        subjectId={subjectId}
        subjects={subjects}
        chapter={chapter}
        chapters={chapters}
        secondsPerQuestion={secondsPerQuestion}
        durationSec={durationSec}
        difficulty={difficulty}
        pointsPerCorrect={pointsPerCorrect}
        lockOnStart={lockOnStart}
        template={tpl}
        challenges={simCh}
        canSubmit={canSubmit}
        onTitleChange={setTitle}
        onClassChange={selectClass}
        onSubjectChange={(nextSubjectId) => { setSubjectId(nextSubjectId); setChapter(''); }}
        onChapterChange={setChapter}
        onSecondsChange={setSeconds}
        onDurationChange={setDurationSec}
        onDifficultyChange={setDifficulty}
        onPointsChange={setPointsPerCorrect}
        onLockChange={setLockOnStart}
        onOpenTemplate={() => setTplOpen(true)}
        onClearTemplate={() => setTpl(null)}
        onChallengesChange={setSimCh}
        onEditChallenge={(index) => { setSimEditIdx(index); setTplOpen(true); }}
        onSave={() => void savePrepared()}
        onCreate={() => void create()}
      />

      <CircuitTemplateModal
        mode={mode}
        open={tplOpen}
        editingTitle={editingSimulation?.title}
        editingIndex={simEditIdx}
        data={canvasData}
        onChange={updateCanvasData}
        onClose={closeTemplateEditor}
      />
    </div>
  );
}

function formatFinishedAt(value: string | null): string {
  if (!value) return 'Không rõ thời gian';
  const parsed = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return FINISHED_AT_FORMATTER.format(parsed);
}

function RecentCircuitDebriefs({ reports, loading }: { reports: RecentCircuitDebrief[]; loading: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (loading) {
    return <Card className="mb-4 flex items-center gap-2 p-4 text-sm text-slate-500"><Spinner /> Đang tải tổng kết mạch gần đây…</Card>;
  }
  if (reports.length === 0) return null;
  return (
    <section className="mb-5" aria-label="Tổng kết mạch gần đây">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600"><i className="fas fa-clock-rotate-left" /> Tổng kết mạch gần đây</h2>
      <div className="space-y-2">
        {reports.map((report) => {
          const expanded = expandedId === report.session.id;
          const summary = report.debrief.summary;
          return (
            <Card key={report.session.id} className="overflow-hidden p-0">
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
                aria-expanded={expanded}
                aria-controls={`circuit-debrief-${report.session.id}`}
                onClick={() => setExpandedId(expanded ? null : report.session.id)}
              >
                <span><span className="block font-bold text-slate-900">{report.session.config.title || 'Mô phỏng mạch'}</span><span className="text-xs text-slate-500">Kết thúc {formatFinishedAt(report.finishedAt)}</span></span>
                <span className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-800">Hoàn thành {summary.completionRate}%</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{summary.learnerCount} học viên</span>
                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-700">{summary.incorrectSubmissionAttempts} lượt chưa đạt</span>
                  <i className={`fas ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'} self-center text-slate-400`} />
                </span>
              </button>
              {expanded && <div id={`circuit-debrief-${report.session.id}`} className="border-t border-slate-200 p-4"><div className="mb-3 flex justify-end"><CircuitDebriefExportActions sessionId={report.session.id} /></div><CircuitLearningDebriefView debrief={report.debrief} /></div>}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function CircuitDebriefExportActions({ sessionId }: { sessionId: string }) {
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);
  async function download(format: 'csv' | 'xlsx') {
    setExporting(format);
    try {
      const token = useAuthStore.getState().token;
      const response = await fetch(`/api/games/${encodeURIComponent(sessionId)}/circuit-debrief/export?format=${format}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error('Không thể xuất tổng kết mạch');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `tong-ket-mach-${sessionId}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã xuất tổng kết mạch ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể xuất tổng kết mạch');
    } finally {
      setExporting(null);
    }
  }
  return (
    <div className="flex flex-wrap gap-2" aria-label="Xuất tổng kết mạch">
      <Button variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={exporting !== null} onClick={() => void download('xlsx')} aria-label="Xuất tổng kết mạch dạng XLSX"><i className="fas fa-file-excel" /> {exporting === 'xlsx' ? 'Đang xuất…' : 'Xuất XLSX'}</Button>
      <Button variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={exporting !== null} onClick={() => void download('csv')} aria-label="Xuất tổng kết mạch dạng CSV"><i className="fas fa-file-csv" /> {exporting === 'csv' ? 'Đang xuất…' : 'Xuất CSV'}</Button>
    </div>
  );
}

function QuestionSelectionCard({
  questions,
  selectedIds,
  loading,
  onToggle,
}: {
  questions: Question[];
  selectedIds: Set<string>;
  loading: boolean;
  onToggle: (questionId: string, checked: boolean) => void;
}) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold text-slate-800">Chọn câu hỏi ({selectedIds.size} đã chọn)</h3>
      {loading ? <Spinner /> : questions.length === 0 ? (
        <EmptyState message="Ngân hàng chưa có câu trắc nghiệm nào" />
      ) : (
        <ul className="max-h-96 space-y-1 overflow-y-auto pr-1">
          {questions.map((question) => (
            <li key={question.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selectedIds.has(question.id)}
                  onChange={(event) => onToggle(question.id, event.target.checked)}
                />
                <span className="min-w-0 flex-1 truncate">{question.content}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CrosswordBuilder({
  keyword,
  rows,
  onKeywordChange,
  onRowChange,
  onAddRow,
  onRemoveRow,
}: {
  keyword: string;
  rows: PuzzleRowDraft[];
  onKeywordChange: (value: string) => void;
  onRowChange: (index: number, patch: Partial<Pick<PuzzleRowDraft, 'clue' | 'word'>>) => void;
  onAddRow: () => void;
  onRemoveRow: () => void;
}) {
  return (
    <Card className="p-5 lg:col-span-2">
      <h3 className="mb-3 font-semibold text-slate-800"><i className="fas fa-puzzle-piece" /> Thiết kế ô chữ</h3>
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div>
          <Label>Từ khóa dọc ({keyword.trim().length} chữ cái)</Label>
          <Input
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value.toUpperCase().replace(/[^A-Za-zÀ-ỹà-ỹ\s]/g, '').slice(0, 10))}
            placeholder="VD: ĐIỆN"
            className="!text-lg font-bold tracking-widest"
          />
          <div className="mt-3 flex flex-col items-center gap-1 rounded-sm border border-slate-200 bg-slate-50 p-3">
            {[...(keyword || ' '.repeat(4))].slice(0, 10).map((character, index) => (
              <span key={`keyword-slot-${index}`} className={`flex h-7 w-7 items-center justify-center rounded-sm ${/\S/.test(character) ? 'bg-blue-900 font-bold text-white' : 'bg-slate-200 text-slate-400'}`}>
                {/\S/.test(character) ? character : index + 1}
              </span>
            ))}
          </div>
        </div>
        <div>
          <Label>Hàng ngang — chữ thứ i của hàng phải trùng chữ thứ i của từ khóa</Label>
          <ul className="space-y-2">
            {rows.map((row, index) => {
              const expected = keyword[index]?.toUpperCase() ?? '?';
              const given = row.word.toUpperCase().replace(/\s+/g, '');
              const matchesKeyword = given[index] === expected;
              return (
                <li key={row.id} className="flex items-start gap-2 rounded-sm border border-slate-200 p-2.5">
                  <span className={`mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${matchesKeyword ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'}`}>{expected}</span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Input value={row.clue} onChange={(event) => onRowChange(index, { clue: event.target.value })} placeholder={`Gợi ý hàng ${index + 1}…`} className="!py-1.5 text-sm" />
                    <Input
                      value={row.word}
                      onChange={(event) => onRowChange(index, { word: event.target.value })}
                      placeholder="Từ khóa hàng ngang…"
                      className={`!py-1.5 text-sm ${given && !matchesKeyword ? '!border-red-600' : ''}`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={onAddRow} disabled={rows.length >= 10}>+ Hàng</Button>
            <Button variant="ghost" onClick={onRemoveRow} disabled={rows.length <= 2}>− Bớt</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

type ClassOption = ReturnType<typeof useMyClasses>[number];

interface GameSettingsCardProps {
  mode: GameMode;
  title: string;
  classId: string;
  classLocked: boolean;
  classes: ClassOption[];
  subjectId: string;
  subjects: SubjectInfo[];
  chapter: string;
  chapters: string[];
  secondsPerQuestion: number;
  durationSec: number;
  difficulty: number;
  pointsPerCorrect: 0.25 | 0.5 | 1;
  lockOnStart: boolean;
  template: CircuitData | null;
  challenges: SimulationChallengeDraft[];
  canSubmit: boolean;
  onTitleChange: (value: string) => void;
  onClassChange: (classId: string) => void;
  onSubjectChange: (subjectId: string) => void;
  onChapterChange: (chapter: string) => void;
  onSecondsChange: (seconds: number) => void;
  onDurationChange: (seconds: number) => void;
  onDifficultyChange: (difficulty: number) => void;
  onPointsChange: (points: 0.25 | 0.5 | 1) => void;
  onLockChange: (locked: boolean) => void;
  onOpenTemplate: () => void;
  onClearTemplate: () => void;
  onChallengesChange: (update: StateUpdate<SimulationChallengeDraft[]>) => void;
  onEditChallenge: (index: number) => void;
  onSave: () => void;
  onCreate: () => void;
}

function GameSettingsCard(props: GameSettingsCardProps) {
  const {
    mode, title, classId, classLocked, classes, subjectId, subjects, chapter, chapters,
    secondsPerQuestion, durationSec, difficulty, pointsPerCorrect, lockOnStart,
    template, challenges, canSubmit, onTitleChange, onClassChange, onSubjectChange,
    onChapterChange, onSecondsChange, onDurationChange, onDifficultyChange,
    onPointsChange, onLockChange, onOpenTemplate, onClearTemplate,
    onChallengesChange, onEditChallenge, onSave, onCreate,
  } = props;
  return (
    <Card className={`h-fit p-5 ${mode === 'math_race' ? 'mx-auto w-full max-w-md lg:col-span-2' : ''}`}>
      <GameContextFields
        title={title} classId={classId} classLocked={classLocked} classes={classes} subjectId={subjectId}
        subjects={subjects} chapter={chapter} chapters={chapters}
        onTitleChange={onTitleChange} onClassChange={onClassChange}
        onSubjectChange={onSubjectChange} onChapterChange={onChapterChange}
      />
      {mode === 'math_race' ? (
        <MathRaceSettings
          durationSec={durationSec} difficulty={difficulty}
          onDurationChange={onDurationChange} onDifficultyChange={onDifficultyChange}
        />
      ) : (
        <>
          {KTTX_MODES.has(mode) && <KttxPointsField value={pointsPerCorrect} onChange={onPointsChange} />}
          {USES_SECONDS.has(mode) && (
            <div>
              <Label>{mode === 'circuit_draw' || mode === 'circuit_simulate' ? 'Thời lượng mỗi lượt / thử thách (giây, 5–120)' : 'Giây mỗi câu (5–120)'}</Label>
              <Input type="number" min={5} max={120} value={secondsPerQuestion} onChange={(event) => onSecondsChange(Math.min(120, Math.max(5, Number(event.target.value))))} />
            </div>
          )}
          {mode === 'circuit_draw' && <CircuitDrawTemplateField template={template} onOpen={onOpenTemplate} onClear={onClearTemplate} />}
          {mode === 'circuit_simulate' && (
            <SimulationChallengesField
              challenges={challenges}
              onChange={onChallengesChange}
              onEdit={onEditChallenge}
            />
          )}
          {!['circuit_draw', 'circuit_simulate', 'bingo', 'memory_match'].includes(mode) && (
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={lockOnStart} onChange={(event) => onLockChange(event.target.checked)} />
              Khóa phòng khi bắt đầu (không nhận người vào trễ)
            </label>
          )}
          <ModeHelpText mode={mode} />
        </>
      )}
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onSave} disabled={!canSubmit}>Lưu sẵn</Button>
        <Button className="flex-1" onClick={onCreate} disabled={!canSubmit}>Tạo phòng game</Button>
      </div>
    </Card>
  );
}

function GameContextFields({
  title, classId, classes, subjectId, subjects, chapter, chapters,
  classLocked, onTitleChange, onClassChange, onSubjectChange, onChapterChange,
}: Pick<GameSettingsCardProps,
  'title' | 'classId' | 'classLocked' | 'classes' | 'subjectId' | 'subjects' | 'chapter' | 'chapters'
  | 'onTitleChange' | 'onClassChange' | 'onSubjectChange' | 'onChapterChange'
>) {
  return (
    <div className="mb-3 space-y-3 rounded-sm border border-slate-200 bg-slate-50 p-3">
      <div><Label>Tên phiên game</Label><Input value={title} onChange={(event) => onTitleChange(event.target.value)} maxLength={200} /></div>
      <div>
        <Label>Lớp học</Label>
        <Select value={classId} onChange={(event) => onClassChange(event.target.value)} disabled={classLocked}>
          <option value="">— Chưa gắn lớp —</option>
          {classes.map((classItem) => <option key={classItem.id} value={classItem.id}>{classItem.name}</option>)}
        </Select>
      </div>
      <div>
        <Label>Môn học</Label>
        <Select value={subjectId} onChange={(event) => onSubjectChange(event.target.value)} disabled={!classId}>
          <option value="">— Tất cả môn —</option>
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </Select>
      </div>
      <div>
        <Label>Chương/Bài</Label>
        <Select value={chapter} onChange={(event) => onChapterChange(event.target.value)} disabled={!subjectId || chapters.length === 0}>
          <option value="">— Tất cả chương/bài —</option>
          {chapters.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </div>
    </div>
  );
}

function MathRaceSettings({ durationSec, difficulty, onDurationChange, onDifficultyChange }: Pick<GameSettingsCardProps, 'durationSec' | 'difficulty' | 'onDurationChange' | 'onDifficultyChange'>) {
  return (
    <>
      <Label>Thời lượng (giây, 30–600)</Label>
      <Input type="number" min={30} max={600} value={durationSec} onChange={(event) => onDurationChange(Math.min(600, Math.max(30, Number(event.target.value))))} />
      <div className="mt-3">
        <Label>Độ khó</Label>
        <Select value={difficulty} onChange={(event) => onDifficultyChange(Number(event.target.value))}>
          <option value={1}>1 — Cộng/trừ cơ bản</option>
          <option value={2}>2 — Nhân/chia</option>
          <option value={3}>3 — Hỗn hợp nâng cao</option>
        </Select>
      </div>
      <p className="mt-3 text-xs text-slate-500">Mỗi học viên nhận bài toán riêng, giải liên tục cho đến hết giờ. Ai giải nhiều nhất thắng.</p>
    </>
  );
}

function KttxPointsField({ value, onChange }: { value: 0.25 | 0.5 | 1; onChange: (value: 0.25 | 0.5 | 1) => void }) {
  return (
    <div className="mb-3">
      <Label>Điểm mỗi lần đúng → cột KTTX</Label>
      <Select value={value} onChange={(event) => onChange(Number(event.target.value) as 0.25 | 0.5 | 1)}>
        <option value={0.25}>+0.25</option><option value={0.5}>+0.5</option><option value={1}>+1</option>
      </Select>
    </div>
  );
}

function CircuitDrawTemplateField({ template, onOpen, onClear }: { template: CircuitData | null; onOpen: () => void; onClear: () => void }) {
  return (
    <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 p-3">
      <Label>Mạch mẫu học viên phải dựng lại</Label>
      {template && template.components.length > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-600"><i className="fas fa-circle-check text-emerald-600" /> {template.components.length} linh kiện · {template.wires.length} dây nối</span>
          <span className="flex gap-1">
            <Button variant="secondary" className="!px-2 !py-1 !text-[10px]" onClick={onOpen}>Sửa</Button>
            <Button variant="ghost" className="!px-2 !py-1 !text-[10px] !text-red-600" onClick={onClear}>Xóa</Button>
          </span>
        </div>
      ) : (
        <>
          <Button variant="secondary" className="w-full !py-2 !text-[11px]" onClick={onOpen}><i className="fas fa-pen-ruler" /> Thiết kế mạch mẫu</Button>
          <p className="mt-1.5 text-[10px] italic text-slate-400">Tùy chọn — bỏ trống thì giáo viên chấm tay từng bài nộp.</p>
        </>
      )}
    </div>
  );
}

function DefaultCircuitChallengeGuide() {
  return (
    <details className="mt-2 rounded-sm border border-blue-200 bg-blue-50 px-2.5 py-2 text-[10px] text-slate-700">
      <summary className="cursor-pointer font-bold text-blue-800">Hướng dẫn giảng dạy bộ 6 bài mặc định</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-4 leading-relaxed">
        {DEFAULT_CIRCUIT_CHALLENGE_GUIDE.map((item) => (
          <li key={item.title}><b>{item.title}:</b> {item.observation}</li>
        ))}
      </ol>
      <p className="mt-2 border-t border-blue-200 pt-2 text-blue-900"><i className="fas fa-lightbulb" /> Học viên nối dây OUT (xanh) → IN (đỏ); Probe hiển thị dạng sóng trên Oscilloscope khi mô phỏng chạy.</p>
    </details>
  );
}

function SimulationChallengesField({
  challenges,
  onChange,
  onEdit,
}: {
  challenges: SimulationChallengeDraft[];
  onChange: (update: StateUpdate<SimulationChallengeDraft[]>) => void;
  onEdit: (index: number) => void;
}) {
  function update(index: number, patch: Partial<SimulationChallengeDraft>) {
    onChange((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }
  return (
    <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 p-3">
      <div className="mb-1 flex items-center justify-between">
        <Label>Thử thách mô phỏng ({challenges.length}/10)</Label>
        <Button
          variant="secondary" className="!px-2 !py-1 !text-[10px]" disabled={challenges.length >= 10}
          onClick={() => {
            const nextIndex = challenges.length;
            onChange((items) => [...items, createSimulationChallenge()]);
            onEdit(nextIndex);
          }}
        >+ Thêm</Button>
      </div>
      {challenges.length === 0 ? (
        <p className="text-[10px] italic leading-relaxed text-slate-400">Bỏ trống để dùng bộ 6 thử thách mẫu <b>Đèn LED · Cổng AND · Mạch NOT · D Flip-Flop · Half Adder · Full Adder</b> — đã có sẵn mạch tham chiếu, chấm tự động.</p>
      ) : (
        <ul className="space-y-1.5">
          {challenges.map((challenge, index) => (
            <li key={challenge.id} className="space-y-1 rounded-sm border border-slate-200 bg-white p-2">
              <div className="flex gap-1">
                <Input value={challenge.title} onChange={(event) => update(index, { title: event.target.value })} placeholder={`Tiêu đề thử thách ${index + 1}`} className="!py-1 !text-[11px]" />
                <Input type="number" min={10} max={1000} value={challenge.points} onChange={(event) => update(index, { points: Number(event.target.value) || 100 })} className="!w-16 shrink-0 !py-1 text-center !text-[11px]" title="Điểm thưởng KTTX" />
                <button onClick={() => onChange((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="shrink-0 px-1 text-xs text-red-400 hover:text-red-700" title="Xóa thử thách">×</button>
              </div>
              <Input value={challenge.description} onChange={(event) => update(index, { description: event.target.value })} placeholder="Mô tả / mục tiêu cần đạt…" className="!py-1 !text-[11px]" />
              <div className="flex items-center justify-between">
                {challenge.tpl && challenge.tpl.components.length > 0 ? (
                  <span className="text-[10px] font-semibold text-emerald-700"><i className="fas fa-circle-check" /> Mạch mẫu: {challenge.tpl.components.length} linh kiện — chấm tự động</span>
                ) : <span className="text-[10px] text-slate-400">Không mạch mẫu</span>}
                <Button variant="secondary" className="!px-2 !py-0.5 !text-[9px]" onClick={() => onEdit(index)}>
                  <i className="fas fa-pen-ruler" /> {challenge.tpl && challenge.tpl.components.length > 0 ? 'Sửa mạch' : 'Vẽ mạch mẫu'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {challenges.length === 0 && <DefaultCircuitChallengeGuide />}
    </div>
  );
}

const MODE_HELP: Partial<Record<GameMode, string>> = {
  quick_quiz: '60 điểm nền + tối đa 40 điểm tốc độ cho mỗi câu đúng.',
  tug_of_war: 'Học viên tự động chia 2 đội xen kẽ khi vào phòng. Mỗi câu, đội có tỷ lệ đúng cao hơn sẽ kéo dây về phía mình.',
  hand_raise: 'Không tính giờ. Học viên giơ tay, giáo viên chọn người và chấm Đúng/Sai; câu đúng tự cộng vào cột KTTX.',
  word_scramble: 'Dùng đáp án của câu hỏi đã chọn làm từ cần xếp. Bắt đầu 500đ, mỗi lần sai trừ 50đ, tối thiểu 100đ/từ.',
  quiz_show: 'Mỗi học viên có 3 quyền trợ giúp: 50:50, Hỏi khán giả và Gọi điện. Chuỗi đúng liên tiếp được ghi nhận.',
  bingo: 'Mỗi học viên nhận phiếu 5×5 riêng. Số được gọi tự động; đủ hàng, cột hoặc đường chéo sẽ ghi điểm.',
  memory_match: '12 cặp thẻ úp chung bảng. Cặp giống nhau giữ mở và ghi điểm; cặp khác úp lại.',
  circuit_draw: 'Học viên dựng mạch rồi nộp; giáo viên xem và chấm Đúng/Sai cho từng bài.',
  circuit_simulate: 'Mạch logic chạy realtime với tín hiệu, LED và oscilloscope; học viên hoàn thành từng thử thách.',
};

function ModeHelpText({ mode }: { mode: GameMode }) {
  const help = MODE_HELP[mode];
  return help ? <p className="mt-3 text-xs text-slate-500">{help}</p> : null;
}

function CircuitTemplateModal({
  mode,
  open,
  editingTitle,
  editingIndex,
  data,
  onChange,
  onClose,
}: {
  mode: GameMode;
  open: boolean;
  editingTitle?: string;
  editingIndex: number | null;
  data: CircuitData | null;
  onChange: (data: CircuitData) => void;
  onClose: () => void;
}) {
  const title = editingIndex !== null
    ? `Mạch mẫu — ${editingTitle || `thử thách ${editingIndex + 1}`}`
    : 'Thiết kế mạch mẫu cho học viên';
  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <p className="mb-2 text-xs text-slate-500">
        Dựng mạch bằng cách bấm linh kiện ở bảng trái, kéo để di chuyển, chế độ <b>Nối</b> để đi dây.
        {mode === 'circuit_simulate' && ' Mạch này vừa là điểm khởi đầu vừa là đáp án để chấm tự động.'}
      </p>
      <div className="h-[480px] overflow-hidden rounded-sm border border-slate-300">
        <CircuitCanvas
          gameType={mode === 'circuit_draw' ? 'circuit_draw' : 'circuit_simulate'}
          initialData={data}
          onChange={(nextData) => onChange({ components: nextData.components, wires: nextData.wires })}
        />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-slate-500">{data?.components.length ?? 0} linh kiện · {data?.wires.length ?? 0} dây</span>
        <Button onClick={onClose}>Xong — dùng mạch này</Button>
      </div>
    </Modal>
  );
}

function useHostConsoleEffects(
  sessionId: string,
  roomCode: string,
  phase: HostPhase,
  setField: HostSetField,
) {
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const feedKey = useRef(0);
  const pendingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    void import('../lib/health').then(({ fetchLanBase }) =>
      fetchLanBase().then((base) => {
        if (!base) return;
        QRCode.toDataURL(`${base}/games/play?room=${roomCode}`, { width: 220, margin: 1 })
          .then((qrCode) => setField('joinQr', qrCode))
          .catch(() => setField('joinQr', null));
      })
    );
  }, [roomCode, setField]);

  useEffect(() => {
    if (phase !== 'race' && phase !== 'sandbox') return;
    const t = setInterval(() => setField('tick', Date.now()), phase === 'race' ? 500 : 1_000);
    return () => clearInterval(t);
  }, [phase, setField]);

  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    const socket = getSocket(token);
    socketRef.current = socket;
    const socketEvents = createSocketEventScope(socket);
    const on = socketEvents.on;

    on('host:sync', (d: HostSyncPayload) => {
      setField('phase', d.circuitSimulate ? 'sandbox' : toHostPhase(d.phase));
      setField('players', d.players);
      setField('leaderboard', d.leaderboard ?? []);
      setField('ropePos', d.ropePos ?? 0);
      if (d.circuitSimulate) {
        setField('csChallenge', d.circuitSimulate.challenge);
        setField('csProgress', d.circuitSimulate.progress);
        setField('csAssistance', d.circuitSimulate.assistance ?? []);
        const restoredPasses = d.circuitSimulate.passes.map((pass) => {
          feedKey.current += 1;
          return { name: pass.name, points: pass.points, key: feedKey.current };
        });
        setField('csPasses', restoredPasses);
      }
    });
    on('lobby:update', (d: { players: { name: string; team?: string; userId?: string }[] }) => setField('players', d.players));
    on('question:show', () => { setField('phase', 'question'); setField('reveal', null); setField('hrResult', null); });
    on('answer:reveal', (d: { correctIdx: number; correctText?: string; counts: number[]; correctCount: number; playerCount: number }) => {
      setField('phase', 'leaderboard');
      setField('reveal', d);
    });
    on('leaderboard:update', (d: { rows: { name: string; score: number }[] }) => setField('leaderboard', d.rows));
    on('tug:update', (d: { ropePos: number; teamA: TugTeam; teamB: TugTeam }) => {
      setField('ropePos', d.ropePos);
      setField('teams', { A: d.teamA, B: d.teamB });
    });
    on('tug:result', (d: { winnerTeam: 'A' | 'B'; teamA: number; teamB: number }) => setField('tugResult', d));
    on('race:start', (d: { endsAt: number }) => { setField('phase', 'race'); setField('raceEndsAt', d.endsAt); });
    on('race:update', (d: { rows: { name: string; solved: number }[] }) => setField('raceRows', d.rows));
    on('circuit_simulate:learning_debrief', (d: CircuitLearningDebrief) => setField('circuitDebrief', d));
    on('game:finished', () => setField('phase', 'finished'));
    on('game:error', (d: { message: string }) => toast.error(d.message));

    on('hr:hands-update', (d: { hands: { userId: string; name: string }[] }) => setField('hands', d.hands));
    on('hr:selected', (d: { userId: string; name: string }) => setField('picked', d));
    on('hr:released', () => setField('picked', null));
    on('hr:result', (d: { name: string; correct: boolean; delta: number; newKttx: number | null }) => {
      setField('hrResult', d);
      const timer = setTimeout(() => {
        pendingTimersRef.current.delete(timer);
        setField('hrResult', null);
      }, 4000);
      pendingTimersRef.current.add(timer);
    });
    on('cw:state', (d: { keywordRevealed: string[]; rows: { index: number; clue: string; wordLen: number; solved: boolean; word: string | null }[]; solvedCount: number; total: number }) => {
      setField('cwState', d);
      setField('phase', 'crossword');
    });

    /* ================= HOST: 6 GAME MỚI ================= */
    // --- Bingo ---
    on('bingo:init', () => setField('phase', 'sandbox'));
    on('bingo:call', (d: { number: number; called: number[] }) => {
      setField('bingoLast', d.number);
      setField('bingoCalled', d.called);
    });
    on('bingo:win', (d: { name: string }) => setField('bingoWinner', d.name));

    // --- Memory Match ---
    on('memory:init', (d: { cards: { id: number; value: string; matched: boolean }[] }) => {
      setField('memBoard', d.cards);
      setField('memPairs', 0);
      setField('memFeed', []);
      setField('phase', 'sandbox');
    });
    on('memory:flip', (d: { cardIndex: number; value: string }) => {
      setField('memBoard', (prev) => prev.map((c) => (c.id === d.cardIndex ? { ...c, value: d.value } : c)));
    });
    on('memory:match', (d: { userId: string; name: string; value: string }) => {
      setField('memBoard', (prev) => prev.map((c) => (d.value === c.value ? { ...c, matched: true } : c)));
      setField('memPairs', (n) => n + 1);
      feedKey.current += 1;
      setField('memFeed', (f) => [{ name: d.name, ok: true, key: feedKey.current }, ...f].slice(0, 6));
    });
    on('memory:hide', (d: { cardIndices: number[] }) => {
      const hiddenIds = new Set(d.cardIndices);
      const timer = setTimeout(() => {
        pendingTimersRef.current.delete(timer);
        setField('memBoard', (prev) =>
          prev.map((c) => (!c.matched && hiddenIds.has(c.id) ? { ...c, value: '?' } : c))
        );
      }, 900);
      pendingTimersRef.current.add(timer);
    });

    // --- Word Scramble ---
    on('word_scramble:update', (d: { players: { userId: string; name: string; solved: number }[] }) => {
      setField('scProgress', d.players.toSorted((a, b) => b.solved - a.solved));
      setField('phase', (current) => current === 'lobby' ? 'sandbox' : current);
    });

    // --- Quiz Show ---
    on('quiz_show:question', (d: { index: number; total: number; question: { content: string; options: string[] } }) => {
      setField('qsQ', d.question); setField('qsIdx', d.index); setField('qsTot', d.total);
      setField('qsReveal', null);
      setField('phase', 'sandbox');
    });
    on('quiz_show:reveal', (d: { correctIdx: number; correctText?: string; scores: { userId: string; name: string; score: number; streak: number }[] }) => {
      setField('qsReveal', { correctIdx: d.correctIdx, correctText: d.correctText });
      setField('qsScores', d.scores.map((s) => ({ name: s.name, score: s.score, streak: s.streak })).sort((a, b) => b.score - a.score));
    });

    // --- Circuit ---
    on('circuit_draw:init', () => { setField('cdPending', []); setField('phase', 'sandbox'); });
    on('circuit_draw:submitted', (d: { userId: string; name: string; circuit: CircuitRoomData }) => {
      setField('cdPending', (prev) => (prev.some((p) => p.userId === d.userId) ? prev : [...prev, { userId: d.userId, name: d.name, circuit: d.circuit }]));
      toast.info(`📥 ${d.name} đã nộp mạch`);
    });
    on('circuit_draw:verified', (d: { userId: string; name: string; correct: boolean }) => {
      setField('cdPending', (prev) => prev.filter((p) => p.userId !== d.userId));
      if (d.correct) toast.success(`✅ Mạch của ${d.name} đã được chấm ĐÚNG`);
      else toast.info(`↩ ${d.name} chưa khớp — học viên có thể nộp lại`);
    });
    on('circuit_simulate:challenge', (d: {
      index: number;
      total: number;
      endsAt: number;
      paused: boolean;
      remainingMs: number;
      challenge: { title: string; description: string; targetBehavior: string };
    }) => {
      setField('csChallenge', {
        ...d.challenge,
        index: d.index,
        total: d.total,
        endsAt: d.endsAt,
        paused: d.paused,
        remainingMs: d.remainingMs,
      });
      setField('phase', 'sandbox');
    });
    on('circuit_simulate:control_state', (d: {
      index: number;
      endsAt: number;
      paused: boolean;
      remainingMs: number;
    }) => {
      setField('csChallenge', (current) => current && current.index === d.index
        ? { ...current, endsAt: d.endsAt, paused: d.paused, remainingMs: d.remainingMs }
        : current);
    });
    on('circuit_simulate:challenge_passed', (d: { userId: string; name: string; points: number }) => {
      feedKey.current += 1;
      setField('csPasses', (prev) => [{ name: d.name, points: d.points, key: feedKey.current }, ...prev].slice(0, 8));
    });
    on('circuit_simulate:progress_snapshot', (d: { rows: CircuitProgressRow[] }) => {
      setField('csProgress', d.rows);
    });
    on('circuit_simulate:progress', (d: CircuitProgressRow) => {
      setField('csProgress', (current) => {
        const withoutCurrent = current.filter((row) => row.userId !== d.userId);
        return [...withoutCurrent, d].toSorted((left, right) => left.name.localeCompare(right.name));
      });
    });
    on('circuit_simulate:inspection', (d: CircuitInspection) => setField('csInspection', d));
    on('circuit_simulate:inspection_update', (d: CircuitInspection) => {
      setField('csInspection', (current) => current?.userId === d.userId ? d : current);
    });
    on('circuit_simulate:teacher-message-status', (d: CircuitAssistanceStatus) => {
      setField('csAssistance', (current) => [d, ...current.filter((row) => row.userId !== d.userId)]);
    });
    on('circuit_simulate:teacher-message-sent', (d: { name: string; kind: 'hint' | 'retry'; delivered: boolean; status: CircuitAssistanceStatus['status'] }) => {
      if (!d.delivered) {
        toast.info(`${d.name} đang ngoại tuyến — hỗ trợ đã được xếp hàng để giao khi kết nối lại.`);
        return;
      }
      toast.success(d.kind === 'hint' ? `Đã gửi gợi ý riêng cho ${d.name}.` : `Đã yêu cầu ${d.name} kiểm tra lại mạch.`);
    });

    socket.emit('game:host-attach', { sessionId });

    return () => {
      for (const timer of pendingTimersRef.current) clearTimeout(timer);
      pendingTimersRef.current.clear();
      socketEvents.dispose();
      socket.disconnect();
    };
  }, [sessionId, setField]);

  return socketRef;
}

function HostConsole({ session }: { session: GameSessionInfo }) {
  const navigate = useNavigate();
  const [state, setField] = useFieldReducer(createHostConsoleState);
  const { phase, players, picked, joinQr } = state;
  const socketRef = useHostConsoleEffects(session.id, session.roomCode, phase, setField);

  function hostPick(userId: string) { socketRef.current?.emit('game:host-pick', { userId }); }
  function hostRelease() { socketRef.current?.emit('game:host-release'); }
  function hostKick(userId: string) { socketRef.current?.emit('game:host-kick', { userId }); }
  function hostVerdict(correct: boolean) {
    if (!picked) return;
    socketRef.current?.emit('game:host-verdict', { userId: picked.userId, correct });
  }

  function hostNext() { socketRef.current?.emit('game:host-next'); }
  function hostStart() { socketRef.current?.emit('game:start'); socketRef.current?.emit('game:host-start'); }
  function qsNext() { socketRef.current?.emit('quiz_show:next'); }
  function circuitVerify(userId: string, correct: boolean) {
    socketRef.current?.emit('circuit_draw:verify', { userId, correct, feedback: '' });
    toast.success(correct ? 'Đã chấm ĐÚNG — cộng KTTX' : 'Đã chấm SAI');
  }
  function circuitControl(action: 'pause' | 'resume' | 'extend' | 'evaluate' | 'skip' | 'restart') {
    socketRef.current?.emit('circuit_simulate:host-control', { action });
  }
  function inspectCircuit(userId: string) {
    socketRef.current?.emit('circuit_simulate:inspect', { userId });
  }
  function sendCircuitTeacherMessage(userId: string, kind: 'hint' | 'retry', message?: string) {
    socketRef.current?.emit('circuit_simulate:teacher-message', { userId, kind, message });
  }

  async function cancel() {
    if (!window.confirm('Kết thúc và đóng phòng game?')) return;
    try {
      await api(`/games/${session.id}/cancel`, { method: 'POST' });
      disconnectSocket();
      navigate('/games');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  return (
    <div className="mx-auto max-w-2xl text-center">
      <HostRoomHeader roomCode={session.roomCode} playerCount={players.length} joinQr={joinQr} />
      <HostLobbyView session={session} state={state} onStart={hostStart} onKick={hostKick} />
      <HandRaiseHostView session={session} state={state} onPick={hostPick} onRelease={hostRelease} onVerdict={hostVerdict} />
      <CrosswordHostView session={session} state={state} />

      <HostSandboxViews
        session={session}
        state={state}
        onQuizNext={qsNext}
        onCircuitVerify={circuitVerify}
        onCircuitControl={circuitControl}
        onCircuitInspect={inspectCircuit}
        onCircuitTeacherMessage={sendCircuitTeacherMessage}
      />

      <TugOfWarHostView session={session} state={state} />
      <MathRaceHostView state={state} />
      <QuizRoundHostView session={session} state={state} onNext={hostNext} />
      <FinishedGameResults session={session} state={state} />

      <button onClick={() => void cancel()} className="mt-6 text-xs text-red-500 hover:text-red-700">Đóng phòng game</button>
    </div>
  );
}

function HostRoomHeader({ roomCode, playerCount, joinQr }: { roomCode: string; playerCount: number; joinQr: string | null }) {
  return <Card className="mb-5 p-6">
    <p className="text-sm text-slate-500">Mã phòng — học viên nhập tại trang Trò chơi</p>
    <div className="my-2 font-mono text-6xl font-bold tracking-widest text-blue-900">{roomCode}</div>
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="flex items-center gap-1.5 rounded-sm border border-blue-200 bg-blue-50 px-2 py-1 text-sm text-blue-900"><i className="fas fa-users" /> {playerCount}/60 thiết bị</span>
      {joinQr && <img src={joinQr} alt="QR vào thẳng trò chơi" className="mt-2 w-40 rounded-sm bg-white p-2" />}
      {joinQr && <p className="w-full text-center text-xs text-slate-500">Học viên quét mã → tự động vào phòng này</p>}
    </div>
  </Card>;
}

function HostLobbyView({ session, state, onStart, onKick }: { session: GameSessionInfo; state: HostConsoleState; onStart: () => void; onKick: (userId: string) => void }) {
  if (state.phase !== 'lobby') return null;
  return <>
    <Card className="mb-5 p-4">
      <h3 className="mb-2 font-semibold text-slate-800">Danh sách chờ</h3>
      {state.players.length === 0 ? <p className="py-4 text-sm text-slate-500">Chưa có ai tham gia…</p> : <div className="flex flex-wrap justify-center gap-2">
        {state.players.map((player) => <span key={player.userId ?? player.name} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${player.team === 'A' ? 'border-blue-200 bg-blue-100 text-blue-900' : player.team === 'B' ? 'border-red-200 bg-red-100 text-red-700' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>
          {player.name}<button type="button" onClick={() => onKick(player.userId ?? '')} aria-label={`Xóa người chơi ${player.name}`} className="text-xs text-red-400 hover:text-red-600">×</button>
        </span>)}
      </div>}
    </Card>
    <Button className="!px-8 !py-3 !text-base" onClick={onStart} disabled={state.players.length === 0 && session.gameType !== 'math_race'}>▶ Bắt đầu</Button>
  </>;
}

function HandRaiseHostView({ session, state, onPick, onRelease, onVerdict }: { session: GameSessionInfo; state: HostConsoleState; onPick: (userId: string) => void; onRelease: () => void; onVerdict: (correct: boolean) => void }) {
  if (session.gameType !== 'hand_raise' || state.phase === 'lobby' || state.phase === 'finished') return null;
  const { hands, picked, hrResult } = state;
  return <Card className="mb-4 p-5 text-left">
    {hrResult && <div className={`mb-3 flex items-center justify-center gap-2 rounded-sm border px-4 py-2.5 text-center text-sm font-semibold ${hrResult.correct ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
      {hrResult.correct ? <><i className="fas fa-circle-check" /> {hrResult.name} đúng — +{hrResult.delta} điểm KTTX{hrResult.newKttx !== null ? ` (KTTX hiện tại: ${hrResult.newKttx})` : ''}</> : <><i className="fas fa-circle-xmark" /> {hrResult.name} chưa đúng</>}
    </div>}
    {picked ? <div className="rounded-sm border border-blue-200 bg-blue-50 p-4 text-center">
      <i className="fas fa-hand-point-up text-blue-900" /> <b className="text-lg">{picked.name}</b> đang trả lời…
      <div className="mt-3 flex justify-center gap-3"><Button className="!px-6" onClick={() => onVerdict(true)}><i className="fas fa-check" /> Đúng</Button><Button variant="danger" className="!px-6" onClick={() => onVerdict(false)}><i className="fas fa-xmark" /> Sai</Button><Button variant="ghost" onClick={onRelease}>Bỏ qua</Button></div>
    </div> : <>
      <h4 className="mb-2 text-sm font-semibold text-slate-700"><i className="fas fa-hand-point-up" /> Đang giơ tay ({hands.length})</h4>
      {hands.length === 0 ? <p className="py-3 text-center text-sm text-slate-500">Chưa ai giơ tay…</p> : <div className="flex flex-wrap justify-center gap-2">{hands.map((hand) => <button key={hand.userId} onClick={() => onPick(hand.userId)} className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"><i className="fas fa-hand" /> {hand.name}</button>)}</div>}
    </>}
  </Card>;
}

function CrosswordHostView({ session, state }: { session: GameSessionInfo; state: HostConsoleState }) {
  const { phase, cwState, hrResult, picked } = state;
  if (session.gameType !== 'crossword' || !cwState || phase === 'lobby' || phase === 'finished') return null;
  return <Card className="mb-4 p-5 text-left">
    {hrResult && <div className={`mb-3 flex items-center justify-center gap-2 rounded-sm border px-4 py-2.5 text-center text-sm font-semibold ${hrResult.correct ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'}`}>{hrResult.correct ? <><i className="fas fa-champagne-glasses" /> {hrResult.name} mở được hàng ô chữ — +{hrResult.delta}đ KTTX</> : <><i className="fas fa-circle-xmark" /> {hrResult.name} chưa đúng</>}</div>}
    <div className="mb-4 flex justify-center gap-1.5">{cwState.rows.map((row) => {
      const character = cwState.keywordRevealed[row.index] ?? '_';
      return <span key={`keyword-${row.index}`} className={`flex h-10 w-10 items-center justify-center rounded-sm text-xl font-extrabold ${character !== '_' ? 'bg-blue-900 text-white animate-pop' : 'bg-slate-200 text-slate-400'}`}>{character}</span>;
    })}</div>
    <ul className="space-y-2">{cwState.rows.map((row) => <li key={row.index} className={`flex items-center gap-3 rounded-sm border px-3 py-2.5 text-sm ${row.solved ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><span className={`font-mono font-bold ${row.solved ? 'text-emerald-600' : 'text-blue-700'}`}>{row.index + 1}</span><span className="min-w-0 flex-1">{row.solved ? <b className="tracking-wide text-emerald-700">{row.word}</b> : row.clue}</span>{!row.solved && <span className="text-xs text-slate-400">{row.wordLen} chữ</span>}</li>)}</ul>
    {picked && <p className="mt-3 rounded-sm border border-blue-200 bg-blue-50 px-3 py-2 text-center text-sm text-blue-900"><i className="fas fa-hand-point-up" /> <b>{picked.name}</b> đang trả lời trên máy của bạn ấy…</p>}
  </Card>;
}

function TugOfWarHostView({ session, state }: { session: GameSessionInfo; state: HostConsoleState }) {
  const { phase, teams, ropePos, tugResult } = state;
  if (session.gameType !== 'tug_of_war' || phase === 'lobby' || !teams) return null;
  return <Card className="mb-4 p-5">
    <div className="mb-2 flex justify-between text-sm font-semibold"><span className="text-blue-700"><i className="fas fa-flag" /> Đội A · {teams.A.score}đ</span><span className="text-red-600">Đội B · {teams.B.score}đ <i className="fas fa-flag" /></span></div>
    <div className="relative h-8 overflow-hidden rounded-full border border-slate-200 bg-slate-100"><div className="absolute left-1/2 top-0 h-full w-px bg-slate-300" /><div className={`absolute top-1 flex h-6 w-10 items-center justify-center rounded-full text-white transition-all duration-700 ${ropePos >= 100 ? 'bg-blue-600' : ropePos <= -100 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ left: `calc(${50 + Math.max(-48, Math.min(48, ropePos * 0.48))}% - 20px)` }}><i className="fas fa-people-pulling text-xs" /></div></div>
    <p className="mt-2 text-xs text-slate-500">Dây nghiêng về phía đội trả lời đúng nhiều hơn. Kéo tới bờ (±100) để thắng tuyệt đối!</p>
    {tugResult && <p className={`mt-3 text-lg font-bold ${tugResult.winnerTeam === 'A' ? 'text-blue-700' : 'text-red-600'}`}><i className="fas fa-trophy text-amber-500" /> Đội {tugResult.winnerTeam} thắng!</p>}
  </Card>;
}

function MathRaceHostView({ state }: { state: HostConsoleState }) {
  if (state.phase !== 'race') return null;
  const raceLeft = Math.max(0, Math.ceil((state.raceEndsAt - (state.tick || Date.now())) / 1000));
  return <Card className="mb-4 p-6"><div className="mb-4 font-mono text-4xl font-bold text-emerald-600">{Math.floor(raceLeft / 60)}:{String(raceLeft % 60).padStart(2, '0')}</div><h3 className="mb-3 font-semibold text-slate-800">Bảng đua trực tiếp</h3><ol className="space-y-1 text-left">{state.raceRows.map((row, index) => <li key={row.name} className={`flex justify-between rounded-sm border px-3 py-1.5 text-sm ${index === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><span>{index + 1}. {row.name}</span><b>{row.solved} bài</b></li>)}</ol></Card>;
}

function QuizRoundHostView({ session, state, onNext }: { session: GameSessionInfo; state: HostConsoleState; onNext: () => void }) {
  const { phase, reveal, leaderboard } = state;
  if ((phase !== 'question' && phase !== 'leaderboard') || !['quick_quiz', 'tug_of_war'].includes(session.gameType)) return null;
  return <Card className="p-6">
    <p className="mb-3 text-sm text-slate-500">{phase === 'question' ? 'Học viên đang trả lời… nhấn để hết giờ / hiện đáp án' : 'Nhấn để sang câu tiếp theo'}</p>
    {reveal && phase === 'leaderboard' && <div className="mb-4 rounded-sm border border-slate-200 bg-slate-50 p-4">
      {session.gameType !== 'tug_of_war' ? <p className="text-emerald-600"><i className="fas fa-check" /> Đáp án đúng: {reveal.correctIdx >= 0 ? String.fromCharCode(65 + reveal.correctIdx) : reveal.correctText} {' '}· {reveal.correctCount}/{reveal.playerCount} đúng</p> : <p className="text-emerald-600"><i className="fas fa-check" /> {reveal.correctCount}/{reveal.playerCount} trả lời đúng — dây đã di chuyển</p>}
      {reveal.counts.some((count) => count > 0) && <div className="mt-2 flex gap-1.5">{reveal.counts.map((count, index) => { const letter = String.fromCharCode(65 + index); return <div key={letter} className={`flex-1 rounded-sm py-1 text-sm font-bold ${index === reveal.correctIdx ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{count}</div>; })}</div>}
    </div>}
    {leaderboard.length > 0 && phase === 'leaderboard' && session.gameType !== 'tug_of_war' && <ol className="mb-4 space-y-1">{leaderboard.slice(0, 10).map((row, index) => <li key={row.name} className={`flex justify-between rounded-sm border px-3 py-1.5 text-sm ${index === 0 ? 'border-amber-200 bg-amber-50' : index === 1 ? 'border-slate-200 bg-slate-100' : index === 2 ? 'border-orange-200 bg-orange-50' : 'border-transparent'}`}><span>{index + 1}. {row.name}</span><b>{row.score}</b></li>)}</ol>}
    <Button onClick={onNext}>{phase === 'question' ? '⏹ Hết giờ / hiện đáp án' : 'Câu tiếp theo ▶'}</Button>
  </Card>;
}

function FinishedGameResults({ session, state }: { session: GameSessionInfo; state: HostConsoleState }) {
  if (state.phase !== 'finished') return null;
  const rows = session.gameType === 'math_race' ? state.raceRows.map((row) => ({ name: row.name, score: row.solved })) : state.leaderboard;
  return <Card className="p-6">
    <h3 className="mb-4 text-xl font-bold text-slate-800"><i className="fas fa-trophy text-amber-500" /> {session.gameType === 'circuit_simulate' && state.circuitDebrief ? 'Tổng kết học tập mạch' : 'Kết quả cuối'}</h3>
    {session.gameType === 'circuit_simulate' && state.circuitDebrief && <><div className="mb-3 flex justify-end"><CircuitDebriefExportActions sessionId={session.id} /></div><CircuitLearningDebriefView debrief={state.circuitDebrief} /></>}
    <ol className="space-y-1.5">{rows.map((row, index) => <li key={row.name} className={`flex justify-between rounded-sm border px-4 py-2 ${index === 0 ? 'border-amber-200 bg-gradient-to-r from-amber-100 to-transparent text-lg font-bold' : index < 3 ? 'border-slate-200 bg-slate-100' : 'border-slate-100 bg-slate-50 text-sm'}`}><span>{index === 0 ? <i className="fas fa-medal text-yellow-500" /> : index === 1 ? <i className="fas fa-medal text-slate-400" /> : index === 2 ? <i className="fas fa-medal text-amber-600" /> : `${index + 1}.`} {row.name}</span><b>{row.score}{session.gameType === 'math_race' ? ' bài' : ' đ'}</b></li>)}</ol>
    {session.config && session.id && <BonusPanel sessionId={session.id} />}
  </Card>;
}

function HostSandboxViews({
  session,
  state,
  onQuizNext,
  onCircuitVerify,
  onCircuitControl,
  onCircuitInspect,
  onCircuitTeacherMessage,
}: {
  session: GameSessionInfo;
  state: HostConsoleState;
  onQuizNext: () => void;
  onCircuitVerify: (userId: string, correct: boolean) => void;
  onCircuitControl: (action: 'pause' | 'resume' | 'extend' | 'evaluate' | 'skip' | 'restart') => void;
  onCircuitInspect: (userId: string) => void;
  onCircuitTeacherMessage: (userId: string, kind: 'hint' | 'retry', message?: string) => void;
}) {
  return (
    <>
      <BingoHostView session={session} state={state} />

      <MemoryMatchHostView session={session} state={state} />

      <WordScrambleHostView session={session} state={state} />

      <QuizShowHostView session={session} state={state} onNext={onQuizNext} />

      <CircuitDrawHostView session={session} state={state} onVerify={onCircuitVerify} />

      <CircuitSimulationHostView session={session} state={state} onControl={onCircuitControl} onInspect={onCircuitInspect} onTeacherMessage={onCircuitTeacherMessage} />

    </>
  );
}

function BingoHostView({ session, state }: { session: GameSessionInfo; state: HostConsoleState }) {
  if (session.gameType !== 'bingo' || state.phase !== 'sandbox') return null;
  const { bingoWinner, bingoLast, bingoCalled, players } = state;
  return <Card className="mb-4 p-6">
    {bingoWinner ? <div className="animate-bounce rounded-sm border-4 border-amber-400 bg-amber-50 p-8"><p className="text-center text-5xl font-black tracking-widest text-amber-600">BINGO!</p><p className="mt-2 text-center text-2xl font-bold text-slate-800"><i className="fas fa-trophy text-amber-500" /> {bingoWinner}</p></div> : <>
      <div className="flex items-center justify-center gap-8"><div className="hidden gap-1 sm:grid sm:grid-cols-5">{['B', 'I', 'N', 'G', 'O'].map((heading) => <span key={heading} className="flex h-10 w-10 items-center justify-center rounded-sm bg-blue-900 text-xl font-black text-white">{heading}</span>)}</div><div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full border-8 border-blue-900 bg-white text-7xl font-black text-blue-900 shadow-xl">{bingoLast ?? '—'}</div></div>
      <div className="mt-5 flex flex-wrap justify-center gap-1">{bingoCalled.slice(-30).map((number, index, called) => <span key={`${number}-${index}`} className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${index === called.length - 1 ? 'bg-amber-400 text-white ring-2 ring-amber-200' : 'bg-slate-200 text-slate-700'}`}>{number}</span>)}</div>
      <p className="mt-3 text-sm text-slate-500"><i className="fas fa-users" /> {players.length} học viên · đã gọi {bingoCalled.length}/75 số</p>
    </>}
  </Card>;
}

function MemoryMatchHostView({ session, state }: { session: GameSessionInfo; state: HostConsoleState }) {
  if (session.gameType !== 'memory_match' || state.phase !== 'sandbox') return null;
  const { memPairs, memBoard, memFeed } = state;
  return <Card className="mb-4 p-5">
    <p className="mb-3 text-center text-sm font-semibold text-slate-700"><i className="fas fa-clone text-blue-700" /> Đã ghép <b className="text-emerald-600">{memPairs}/12</b> cặp</p>
    {memBoard.length > 0 && <div className="mx-auto grid w-fit grid-cols-6 gap-2">{memBoard.map((card) => <div key={card.id} className={`flex aspect-square w-12 items-center justify-center rounded-sm border text-base font-black transition-colors ${card.matched ? 'border-emerald-400 bg-emerald-100 text-emerald-700' : card.value !== '?' ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-300 bg-gradient-to-br from-slate-600 to-slate-800 text-transparent'}`}>{card.value}</div>)}</div>}
    {memFeed.length > 0 && <ul className="mx-auto mt-3 max-w-xs space-y-1 text-left text-sm">{memFeed.map((entry) => <li key={entry.key} className="rounded-sm bg-emerald-50 px-3 py-1 text-emerald-700">✅ {entry.name} ghép đúng 1 cặp</li>)}</ul>}
  </Card>;
}

function WordScrambleHostView({ session, state }: { session: GameSessionInfo; state: HostConsoleState }) {
  if (session.gameType !== 'word_scramble' || state.phase !== 'sandbox') return null;
  return <Card className="mb-4 p-5 text-left">
    <h4 className="mb-2 text-sm font-semibold text-slate-700"><i className="fas fa-shuffle" /> Tiến độ xếp chữ</h4>
    {state.scProgress.length === 0 ? <p className="py-3 text-center text-sm text-slate-500">Đang trộn chữ cái đầu tiên…</p> : <ol className="space-y-1">{state.scProgress.map((player, index) => <li key={player.userId} className={`flex justify-between rounded-sm border px-3 py-1.5 text-sm ${index === 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}><span>{index + 1}. {player.name}</span><b>{player.solved} từ</b></li>)}</ol>}
  </Card>;
}

function QuizShowHostView({ session, state, onNext }: { session: GameSessionInfo; state: HostConsoleState; onNext: () => void }) {
  const { phase, qsQ, qsIdx, qsTot, qsReveal, qsScores } = state;
  if (session.gameType !== 'quiz_show' || phase !== 'sandbox' || !qsQ) return null;
  return <Card className="mb-4 p-5 text-left">
    <div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400"><span>Câu {qsIdx + 1}/{qsTot}</span>{qsReveal && <span className="text-emerald-600">Đáp án: {qsReveal.correctIdx >= 0 ? String.fromCharCode(65 + qsReveal.correctIdx) : qsReveal.correctText}</span>}</div>
    <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed">{qsQ.content}</p>
    <div className="mt-3 grid grid-cols-2 gap-2">{qsQ.options.map((option, index) => { const letter = String.fromCharCode(65 + index); return <div key={letter} className={`rounded-sm border px-3 py-2 text-sm ${qsReveal && index === qsReveal.correctIdx ? 'border-emerald-400 bg-emerald-100 font-bold text-emerald-900' : 'border-slate-200 bg-slate-50'}`}><b>{letter}.</b> {option.replace(/^([A-D])[\.\:\)]\s+/, '')}</div>; })}</div>
    {!qsReveal && <Button className="mt-4 w-full" onClick={onNext}>Tự động hết giờ — hoặc sang câu tiếp theo ▶</Button>}
    {qsScores.length > 0 && <ol className="mt-4 space-y-1 border-t border-slate-200 pt-3">{qsScores.slice(0, 10).map((score, index) => <li key={score.name + index} className="flex justify-between rounded-sm border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm"><span>{index + 1}. {score.name}{score.streak >= 3 && <span className="ml-1.5 text-xs text-orange-600">🔥{score.streak}</span>}</span><b>{score.score} đ</b></li>)}</ol>}
  </Card>;
}

function CircuitDrawHostView({ session, state, onVerify }: { session: GameSessionInfo; state: HostConsoleState; onVerify: (userId: string, correct: boolean) => void }) {
  if (session.gameType !== 'circuit_draw' || state.phase !== 'sandbox') return null;
  return <Card className="mb-4 p-5 text-left">
    <h4 className="mb-2 text-sm font-semibold text-slate-700"><i className="fas fa-drafting-compass" /> Bài nộp chờ chấm ({state.cdPending.length})</h4>
    {state.cdPending.length === 0 ? <p className="py-3 text-center text-sm text-slate-500">Chưa có bài nộp — học viên dựng mạch trên máy của họ rồi bấm “Nộp mạch”.</p> : <ul className="space-y-3">{state.cdPending.map((submission) => <li key={submission.userId} className="rounded-sm border border-blue-200 bg-blue-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium text-blue-900">📥 {submission.name}</span><span className="flex gap-2"><button onClick={() => onVerify(submission.userId, true)} className="rounded-sm bg-emerald-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-emerald-700"><i className="fas fa-check" /> Đúng +KTTX</button><button onClick={() => onVerify(submission.userId, false)} className="rounded-sm bg-red-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-red-700"><i className="fas fa-xmark" /> Sai</button></span></div>
      {submission.circuit && <div className="relative mt-2 h-48 overflow-hidden rounded-sm border border-slate-200 bg-white"><CircuitCanvas gameType="circuit_draw" initialData={toCanvasData(submission.circuit)} onChange={() => undefined} /><div className="absolute inset-0" /></div>}
    </li>)}</ul>}
  </Card>;
}

function CircuitSimulationHostView({ session, state, onControl, onInspect, onTeacherMessage }: { session: GameSessionInfo; state: HostConsoleState; onControl: (action: 'pause' | 'resume' | 'extend' | 'evaluate' | 'skip' | 'restart') => void; onInspect: (userId: string) => void; onTeacherMessage: (userId: string, kind: 'hint' | 'retry', message?: string) => void }) {
  if (session.gameType !== 'circuit_simulate' || state.phase !== 'sandbox' || !state.csChallenge) return null;
  return <CircuitSimulateHostView challenge={state.csChallenge} passes={state.csPasses} progress={state.csProgress} inspection={state.csInspection} assistance={state.csAssistance} leaderboard={state.leaderboard} onControl={onControl} onInspect={onInspect} onTeacherMessage={onTeacherMessage} now={state.tick || Date.now()} />;
}

function CircuitLearningDebriefView({ debrief }: { debrief: CircuitLearningDebrief }) {
  const { summary, learners } = debrief;
  return (
    <section className="mb-6" aria-label="Tổng kết học tập mạch">
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-sm border border-blue-200 bg-blue-50 p-3"><p className="text-xs font-semibold uppercase text-blue-700">Hoàn thành lớp</p><p className="mt-1 text-2xl font-black text-blue-950">{summary.completionRate}%</p><p className="text-xs text-blue-700">{summary.totalCompletions}/{summary.totalPossible} lượt bài</p></div>
        <div className="rounded-sm border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold uppercase text-emerald-700">Hoàn thành toàn bộ</p><p className="mt-1 text-2xl font-black text-emerald-950">{summary.completedAllCount}/{summary.learnerCount}</p><p className="text-xs text-emerald-700">học viên</p></div>
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-600">Tổng lượt nộp</p><p className="mt-1 text-2xl font-black text-slate-900">{summary.totalSubmissionAttempts}</p><p className="text-xs text-slate-600">lượt chủ động</p></div>
        <div className="rounded-sm border border-rose-200 bg-rose-50 p-3"><p className="text-xs font-semibold uppercase text-rose-700">Cần sửa</p><p className="mt-1 text-2xl font-black text-rose-950">{summary.incorrectSubmissionAttempts}</p><p className="text-xs text-rose-700">lượt chưa đạt</p></div>
      </div>
      <div className="overflow-x-auto rounded-sm border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="px-3 py-2">Học viên</th><th className="px-3 py-2 text-center">Tiến độ</th><th className="px-3 py-2 text-center">Lượt nộp</th><th className="px-3 py-2 text-center">Chưa đạt</th><th className="px-3 py-2 text-right">Điểm</th></tr></thead>
          <tbody>{learners.map((learner) => <tr key={learner.userId} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold text-slate-800">{learner.name}</td><td className="px-3 py-2 text-center">{learner.completedCount}/{learner.totalChallenges}</td><td className="px-3 py-2 text-center">{learner.totalSubmissionAttempts}</td><td className={`px-3 py-2 text-center font-semibold ${learner.incorrectSubmissionAttempts > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{learner.incorrectSubmissionAttempts}</td><td className="px-3 py-2 text-right font-bold">{learner.score} đ</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function CircuitSimulateHostView({
  challenge,
  passes,
  progress,
  inspection,
  assistance,
  leaderboard,
  onControl,
  onInspect,
  onTeacherMessage,
  now,
}: {
  challenge: NonNullable<HostConsoleState['csChallenge']>;
  passes: HostConsoleState['csPasses'];
  progress: CircuitProgressRow[];
  inspection: CircuitInspection | null;
  assistance: CircuitAssistanceStatus[];
  leaderboard: HostConsoleState['leaderboard'];
  onControl: (action: 'pause' | 'resume' | 'extend' | 'evaluate' | 'skip' | 'restart') => void;
  onInspect: (userId: string) => void;
  onTeacherMessage: (userId: string, kind: 'hint' | 'retry', message?: string) => void;
  now: number;
}) {
  const onlineProgress = progress.filter((row) => row.online);
  const completedOnline = onlineProgress.filter((row) => row.completedCurrent).length;
  const attemptedCount = onlineProgress.filter((row) => row.submissionAttempts > 0).length;
  const incorrectCount = onlineProgress.filter((row) => !row.completedCurrent && row.submissionAttempts > 0 && row.lastValidationCode !== 'correct').length;
  const readinessPercent = onlineProgress.length > 0 ? Math.round((completedOnline / onlineProgress.length) * 100) : 0;
  return (
    <Card className="mb-4 border-l-4 border-l-blue-600 p-5 text-left">
      <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Thử thách {challenge.index + 1}/{challenge.total}</p>
      <h4 className="mt-0.5 font-bold text-slate-800">{challenge.title}</h4>
      <p className="text-sm text-slate-600">{challenge.description}</p>
      <p className="mt-1 text-xs italic text-emerald-700"><i className="fas fa-bullseye" /> Mục tiêu: {challenge.targetBehavior}</p>
      <div className={`mt-4 rounded-sm border px-3 py-2 ${challenge.paused ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-900'}`} role="status" aria-live="polite">
        <p className="text-xs font-semibold">
          <i className={`fas ${challenge.paused ? 'fa-circle-pause' : 'fa-clock'}`} />{' '}
          {challenge.paused ? `Đang tạm dừng · còn ${Math.ceil(challenge.remainingMs / 1000)} giây` : 'Đồng hồ thử thách đang chạy'}
        </p>
      </div>
      <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 p-3" aria-label="Mức sẵn sàng của lớp">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
          <p className="font-bold"><i className="fas fa-gauge-high text-blue-700" /> Sẵn sàng chuyển bài: {completedOnline}/{onlineProgress.length} học viên online</p>
          <p>{attemptedCount} đã nộp · <span className={incorrectCount > 0 ? 'font-semibold text-rose-700' : 'text-emerald-700'}>{incorrectCount} chưa đạt</span></p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Tỷ lệ hoàn thành challenge" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readinessPercent}>
          <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${readinessPercent}%` }} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Điều khiển thử thách mạch">
        <Button variant={challenge.paused ? 'primary' : 'secondary'} onClick={() => onControl(challenge.paused ? 'resume' : 'pause')} aria-label={challenge.paused ? 'Tiếp tục' : 'Tạm dừng'}>
          <i className={`fas ${challenge.paused ? 'fa-play' : 'fa-pause'}`} />
          {challenge.paused ? 'Tiếp tục' : 'Tạm dừng'}
        </Button>
        <Button variant="secondary" onClick={() => onControl('extend')} aria-label="Gia hạn thêm 30 giây"><i className="fas fa-clock-rotate-left" /> +30 giây</Button>
        <Button onClick={() => onControl('evaluate')} aria-label="Chấm ngay và chuyển bài"><i className="fas fa-check-double" /> Chấm ngay &amp; chuyển bài</Button>
        <Button variant="secondary" onClick={() => onControl('restart')} aria-label="Làm lại thử thách"><i className="fas fa-rotate-right" /> Làm lại thử thách</Button>
        <Button variant="ghost" onClick={() => onControl('skip')} aria-label="Bỏ qua thử thách"><i className="fas fa-forward-step" /> Bỏ qua thử thách</Button>
      </div>
      <CircuitProgressMonitor progress={progress} inspection={inspection} assistance={assistance} onInspect={onInspect} onTeacherMessage={onTeacherMessage} now={now} />
      {passes.length > 0 && (
        <ul className="mt-3 space-y-1">
          {passes.map((entry) => <li key={entry.key} className="rounded-sm bg-emerald-50 px-3 py-1 text-sm text-emerald-700">🎯 {entry.name} vượt qua thử thách (+{entry.points}đ → KTTX)</li>)}
        </ul>
      )}
      {leaderboard.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">Bảng xếp hạng mạch</h5>
          <ol className="mt-2 space-y-1">
            {leaderboard.slice(0, 10).map((row, index) => <li key={row.name} className="flex justify-between rounded-sm bg-slate-50 px-3 py-1 text-sm text-slate-700"><span>{index + 1}. {row.name}</span><b>{row.score}đ</b></li>)}
          </ol>
        </div>
      )}
    </Card>
  );
}

function circuitActivityLabel(row: CircuitProgressRow, now: number): string {
  if (row.status === 'disconnected') return 'Ngoại tuyến';
  if (row.status === 'completed') return 'Đã hoàn thành';
  if (row.status === 'not_started') return 'Chưa thao tác';
  const ageSeconds = Math.max(0, Math.floor((now - row.lastActivityAt) / 1_000));
  return ageSeconds < 2 ? 'Vừa thao tác' : `Hoạt động ${ageSeconds} giây trước`;
}

function circuitSubmissionLabel(row: CircuitProgressRow, now: number): string {
  if (row.lastSubmissionAt === null) return '';
  const ageSeconds = Math.max(0, Math.floor((now - row.lastSubmissionAt) / 1_000));
  return ageSeconds < 2 ? 'vừa nộp' : `nộp ${ageSeconds} giây trước`;
}

function CircuitProgressMonitor({ progress, inspection, assistance, onInspect, onTeacherMessage, now }: {
  progress: CircuitProgressRow[];
  inspection: CircuitInspection | null;
  assistance: CircuitAssistanceStatus[];
  onInspect: (userId: string) => void;
  onTeacherMessage: (userId: string, kind: 'hint' | 'retry', message?: string) => void;
  now: number;
}) {
  const [hint, setHint] = useState('');
  const [filter, setFilter] = useState<CircuitSupportFilter>('all');
  const queue = buildCircuitSupportQueue(progress, assistance, now, filter);
  function selectLearner(userId: string) { setHint(''); onInspect(userId); }
  return (
    <section className="mt-4 border-t border-slate-200 pt-4" aria-label="Tiến độ học viên mạch">
      <CircuitProgressHeader count={progress.length} />
      <CircuitSupportQueueControls
        progressCount={progress.length}
        attentionCount={queue.attentionCount}
        prioritized={queue.prioritized}
        selectedUserId={inspection?.userId}
        filter={filter}
        filterOptions={queue.filterOptions}
        onFilter={setFilter}
        onSelect={selectLearner}
      />
      <CircuitProgressList
        progressCount={progress.length}
        visible={queue.visible}
        assistanceByUser={queue.assistanceByUser}
        selectedUserId={inspection?.userId}
        now={now}
        onSelect={selectLearner}
      />
      <CircuitInspectionPanel
        inspection={inspection}
        assistance={assistance}
        hint={hint}
        now={now}
        onHint={setHint}
        onTeacherMessage={onTeacherMessage}
      />
    </section>
  );
}

function CircuitProgressHeader({ count }: { count: number }) {
  return <div className="flex flex-wrap items-center justify-between gap-2">
    <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500">Tiến độ học viên ({count})</h5>
    <span className="text-[11px] text-slate-400">Bấm một học viên để xem mạch hiện tại</span>
  </div>;
}

function CircuitSupportQueueControls({ progressCount, attentionCount, prioritized, selectedUserId, filter, filterOptions, onFilter, onSelect }: {
  progressCount: number;
  attentionCount: number;
  prioritized: CircuitSupportEntry[];
  selectedUserId?: string;
  filter: CircuitSupportFilter;
  filterOptions: Array<{ id: CircuitSupportFilter; label: string; count: number }>;
  onFilter: (filter: CircuitSupportFilter) => void;
  onSelect: (userId: string) => void;
}) {
  if (progressCount === 0) return null;
  function selectNextLearner() {
    const next = prioritized.find((entry) => entry.meta.attention && entry.row.userId !== selectedUserId)
      ?? prioritized.find((entry) => entry.meta.attention);
    if (next) onSelect(next.row.userId);
  }
  return <div className="mt-3 rounded-sm border border-slate-200 bg-slate-50 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs font-semibold text-slate-700" aria-live="polite"><i className="fas fa-list-check text-blue-700" /> Cần xử lý ngay: <b className="text-rose-700">{attentionCount}</b></p>
      <Button variant="secondary" disabled={attentionCount === 0} onClick={selectNextLearner}>Học viên cần hỗ trợ tiếp theo</Button>
    </div>
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Lọc hàng đợi hỗ trợ">
      {filterOptions.map((option) => <button key={option.id} type="button" aria-pressed={filter === option.id} onClick={() => onFilter(option.id)} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${filter === option.id ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-blue-400'}`}>{option.label} ({option.count})</button>)}
    </div>
  </div>;
}

function CircuitProgressList({ progressCount, visible, assistanceByUser, selectedUserId, now, onSelect }: {
  progressCount: number;
  visible: CircuitSupportEntry[];
  assistanceByUser: Map<string, CircuitAssistanceStatus>;
  selectedUserId?: string;
  now: number;
  onSelect: (userId: string) => void;
}) {
  if (progressCount === 0) return <p className="mt-2 rounded-sm bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">Chưa có học viên tham gia thử thách.</p>;
  if (visible.length === 0) return <p className="mt-2 rounded-sm bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">Không có học viên phù hợp bộ lọc này.</p>;
  return <ul className="mt-2 grid gap-2 sm:grid-cols-2">
    {visible.map((entry) => <CircuitProgressListItem key={entry.row.userId} entry={entry} assistance={assistanceByUser.get(entry.row.userId)} selected={selectedUserId === entry.row.userId} now={now} onSelect={onSelect} />)}
  </ul>;
}

function CircuitProgressListItem({ entry, assistance, selected, now, onSelect }: {
  entry: CircuitSupportEntry;
  assistance?: CircuitAssistanceStatus;
  selected: boolean;
  now: number;
  onSelect: (userId: string) => void;
}) {
  const { row, meta } = entry;
  const status = meta.stuck ? { label: 'Cần hỗ trợ', className: 'bg-rose-100 text-rose-700' } : CIRCUIT_PROGRESS_STATUS[row.status];
  return <li>
    <button type="button" onClick={() => onSelect(row.userId)} aria-label={`Xem mạch ${row.name}`} className={`w-full rounded-sm border p-3 text-left transition ${selected ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-white'}`}>
      <span className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-sm font-semibold text-slate-800">{row.name}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>{status.label}</span></span>
      <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500"><span>{row.componentCount} linh kiện · {row.wireCount} dây</span><span>{row.completedCount}/{row.totalChallenges} bài · {row.score}đ</span><span className={meta.stuck ? 'font-semibold text-rose-700' : ''}>{circuitActivityLabel(row, now)}</span></span>
      <CircuitSubmissionBadge row={row} />
      <CircuitAssistanceBadge assistance={assistance} />
    </button>
  </li>;
}

function CircuitSubmissionBadge({ row }: { row: CircuitProgressRow }) {
  if (row.submissionAttempts === 0 || !row.lastValidationCode) return null;
  return <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.lastValidationCode === 'correct' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{row.lastValidationCode === 'correct' ? 'Đã nộp đúng' : 'Nộp chưa đạt'} · {row.submissionAttempts} lần</span>;
}

function CircuitAssistanceBadge({ assistance }: { assistance?: CircuitAssistanceStatus }) {
  if (!assistance) return null;
  const className = assistance.status === 'acknowledged' ? 'bg-emerald-100 text-emerald-700' : assistance.status === 'delivered' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800';
  const label = assistance.status === 'acknowledged' ? 'Đã xác nhận hỗ trợ' : assistance.status === 'delivered' ? 'Chờ xác nhận hỗ trợ' : 'Hỗ trợ đang xếp hàng';
  return <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}>{label}</span>;
}

function CircuitInspectionPanel({ inspection, assistance, hint, now, onHint, onTeacherMessage }: {
  inspection: CircuitInspection | null;
  assistance: CircuitAssistanceStatus[];
  hint: string;
  now: number;
  onHint: (hint: string) => void;
  onTeacherMessage: (userId: string, kind: 'hint' | 'retry', message?: string) => void;
}) {
  if (!inspection) return null;
  const selectedAssistance = assistance.find((row) => row.userId === inspection.userId);
  return <div className="mt-3 rounded-sm border border-blue-200 bg-blue-50 p-3" aria-label={`Mạch hiện tại của ${inspection.name}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h6 className="text-sm font-bold text-blue-900">Mạch hiện tại · {inspection.name}</h6><span className="text-[11px] text-blue-700">{inspection.componentCount} linh kiện · {inspection.wireCount} dây · mô phỏng {inspection.simulationState}</span></div>
    <CircuitInspectionDiagnostics inspection={inspection} now={now} />
    <CircuitInspectionTopology inspection={inspection} />
    <CircuitPrivateAssistance inspection={inspection} assistance={selectedAssistance} hint={hint} onHint={onHint} onTeacherMessage={onTeacherMessage} />
  </div>;
}

function CircuitInspectionDiagnostics({ inspection, now }: { inspection: CircuitInspection; now: number }) {
  if (!inspection.lastValidationCode || !inspection.lastValidationFeedback) return null;
  const correct = inspection.lastValidationCode === 'correct';
  return <div className={`mt-2 rounded-sm border px-3 py-2 text-xs ${correct ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`} role="status" aria-label={`Chẩn đoán lần nộp của ${inspection.name}`}>
    <p className="font-bold"><i className={`fas ${correct ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} /> {correct ? 'Lần nộp gần nhất đã đạt' : 'Lần nộp gần nhất chưa đạt'} · {inspection.submissionAttempts} lần · {circuitSubmissionLabel(inspection, now)}</p>
    <p className="mt-0.5">{inspection.lastValidationFeedback}</p>
  </div>;
}

function CircuitInspectionTopology({ inspection }: { inspection: CircuitInspection }) {
  if (!inspection.circuit || inspection.circuit.components.length === 0) return <p className="mt-2 rounded-sm bg-white px-3 py-6 text-center text-xs text-slate-500">Học viên chưa đặt linh kiện cho thử thách này.</p>;
  return <div className="relative mt-2 h-64 overflow-hidden rounded-sm border border-blue-200 bg-white">
    <CircuitCanvas gameType="circuit_simulate" initialData={toCanvasData(inspection.circuit)} onChange={() => undefined} />
    <div className="absolute inset-0" aria-hidden="true" />
  </div>;
}

function CircuitPrivateAssistance({ inspection, assistance, hint, onHint, onTeacherMessage }: {
  inspection: CircuitInspection;
  assistance?: CircuitAssistanceStatus;
  hint: string;
  onHint: (hint: string) => void;
  onTeacherMessage: (userId: string, kind: 'hint' | 'retry', message?: string) => void;
}) {
  function sendHint() { onTeacherMessage(inspection.userId, 'hint', hint.trim()); onHint(''); }
  return <div className="mt-3 rounded-sm border border-blue-200 bg-white p-3">
    <label htmlFor={`circuit-hint-${inspection.userId}`} className="block text-sm font-medium text-slate-700">Gợi ý riêng cho {inspection.name}</label>
    <div className="mt-1 flex flex-col gap-2 sm:flex-row"><Input id={`circuit-hint-${inspection.userId}`} value={hint} maxLength={300} onChange={(event) => onHint(event.target.value)} placeholder="Ví dụ: Kiểm tra lại dây nối từ OUT sang IN…" /><Button onClick={sendHint} disabled={!hint.trim()}>Gửi gợi ý</Button></div>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[11px] text-slate-500">Tin nhắn chỉ hiển thị trên thiết bị của học viên đang chọn; không thay đổi mạch hoặc điểm.</span><Button variant="secondary" onClick={() => onTeacherMessage(inspection.userId, 'retry')}><i className="fas fa-rotate-right" /> Yêu cầu kiểm tra lại</Button></div>
    <CircuitAssistanceDeliveryStatus assistance={assistance} />
  </div>;
}

function CircuitAssistanceDeliveryStatus({ assistance }: { assistance?: CircuitAssistanceStatus }) {
  if (!assistance) return null;
  const className = assistance.status === 'acknowledged' ? 'bg-emerald-50 text-emerald-700' : assistance.status === 'delivered' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-800';
  const icon = assistance.status === 'acknowledged' ? 'fa-circle-check' : assistance.status === 'delivered' ? 'fa-paper-plane' : 'fa-clock';
  const message = assistance.status === 'acknowledged' ? 'Học viên đã xác nhận “Đã hiểu”.' : assistance.status === 'delivered' ? 'Đã giao tới thiết bị — chờ học viên xác nhận.' : 'Đã xếp hàng — sẽ tự giao khi học viên kết nối lại.';
  return <p className={`mt-2 rounded-sm px-2 py-1.5 text-xs font-semibold ${className}`} role="status"><i className={`fas ${icon}`} />{' '}{message}</p>;
}

/* Chuyển payload mạch (định dạng backend) → dữ liệu cho CircuitCanvas preview */
function toCanvasData(c: CircuitRoomData): CircuitData {
  return {
    components: c.components.map((x) => ({
      id: String(x.id),
      type: String(x.type),
      x: Number(x.x) || 0,
      y: Number(x.y) || 0,
      rot: Number(x.rot ?? x.rotation ?? 0),
      props: x.props ?? x.properties ?? {},
    })),
    wires: c.wires.map((w, i) => ({
      id: String(w.id ?? `w${i}`),
      from: `${w.from}::${w.fromPort ?? 'pin-0'}`,
      to: `${w.to}::${w.toPort ?? 'pin-1'}`,
    })),
  };
}

function PreparedGamesTab({ onLaunched, initialClassId, initialSubjectId, lockedClassId }: { onLaunched: (session: GameSessionInfo) => void; initialClassId: string; initialSubjectId: string; lockedClassId: string }) {
  const [games, setGames] = useState<PreparedGame[]>([]);
  const [classId, setClassId] = useState(initialClassId);
  const [loading, setLoading] = useState(true);
  const classes = useMyClasses();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (classId) params.set('classId', classId);
      if (initialSubjectId) params.set('subjectId', initialSubjectId);
      const query = params.size ? `?${params}` : '';
      const res = await api<{ preparedGames: PreparedGame[] }>(`/prepared-games${query}`);
      setGames(res.preparedGames);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải game đã lưu');
    } finally {
      setLoading(false);
    }
  }, [classId, initialSubjectId]);

  useEffect(() => { void load(); }, [load]);

  async function launch(game: PreparedGame) {
    try {
      const res = await api<{ id: string; roomCode: string }>(`/prepared-games/${game.id}/launch`, {
        method: 'POST',
        body: JSON.stringify({ classId: lockedClassId || game.classId || undefined, subjectId: initialSubjectId || game.subjectId || undefined }),
      });
      toast.success(`Đã tạo phòng ${res.roomCode}`);
      onLaunched({
        id: res.id,
        roomCode: res.roomCode,
        gameType: game.gameType,
        status: 'lobby',
        questionCount: game.questionIds.length,
        config: { title: game.title, secondsPerQuestion: game.config.secondsPerQuestion ?? 20 },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi chạy game');
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Xóa game đã lưu này?')) return;
    try {
      await api(`/prepared-games/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi xóa game');
    }
  }

  return (
    <div>
      <div className="mb-4 max-w-xs">
        <Label>Lọc theo lớp</Label>
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} disabled={Boolean(lockedClassId)}>
          <option value="">Tất cả lớp</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {loading ? <Spinner /> : games.length === 0 ? (
        <Card className="p-6"><EmptyState message="Chưa có game nào được lưu. Hãy thiết kế game rồi chọn “Lưu sẵn”." /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {games.map((game) => (
            <Card key={game.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{game.title}</p>
                  <p className="mt-1 text-xs text-slate-500"><i className={`fas ${MODE_META[game.gameType].icon}`} /> {MODE_META[game.gameType].label}</p>
                </div>
                <button onClick={() => void remove(game.id)} className="text-xs text-red-500 hover:text-red-700">Xóa</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1 text-xs text-slate-500">
                <span className="rounded bg-slate-100 px-2 py-1">{game.questionIds.length} câu hỏi</span>
                {game.classId && <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">Đã gắn lớp</span>}
                {game.subjectId && <span className="rounded bg-violet-50 px-2 py-1 text-violet-700">Đã gắn môn</span>}
              </div>
              <Button className="mt-4 w-full" onClick={() => void launch(game)}>Chạy game</Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function GameGuideModal({ mode, onClose }: { mode: GameMode; onClose: (remember?: boolean) => void }) {
  const guide = guideFor(mode);
  const [remember, setRemember] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Cách chơi — ${MODE_META[mode].label}`} wide>
      <img src={guide.gif} alt={`Minh họa cách chơi ${MODE_META[mode].label}`} className="aspect-video w-full rounded-sm border border-slate-200 bg-slate-100 object-cover" />
      <p className="mt-4 text-sm leading-relaxed text-slate-600">{guide.caption}</p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
        {guide.rules.map((rule) => <li key={rule}>{rule}</li>)}
      </ol>
      <p className="mt-4 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><i className="fas fa-star text-amber-500" /> <b>Tính điểm:</b> {guide.scoring}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Không tự hiện lại khi đổi game
        </label>
        <Button onClick={() => onClose(remember)}>Đã hiểu</Button>
      </div>
    </Modal>
  );
}

function RandomPickerTab() {  const classes = useMyClasses();
  const [classId, setClassId] = useState('');
  const [count, setCount] = useState<1 | 2>(1);
  const [spinning, setSpinning] = useState(false);
  const [picked, setPicked] = useState<{ id: string; displayName: string }[] | null>(null);

  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0].id);
  }, [classes, classId]);

  const pick = useCallback(async () => {
    if (!classId) return;
    setSpinning(true);
    setPicked(null);
    try {
      const res = await api<{ picked: { id: string; displayName: string }[] }>('/games/random-pick', {
        method: 'POST',
        body: JSON.stringify({ classId, count }),
      });
      setTimeout(() => {
        setPicked(res.picked);
        setSpinning(false);
      }, 1800);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi bốc thăm');
      setSpinning(false);
    }
  }, [classId, count]);

  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <h3 className="font-semibold text-slate-800">Bốc thăm học viên phát biểu</h3>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="text-left"><Label>Lớp</Label>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="text-left"><Label>Số người</Label>
          <Select value={count} onChange={(e) => setCount(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1 học viên</option><option value={2}>2 học viên</option>
          </Select>
        </div>
      </div>
      <Button className="mt-5 w-full !py-3" onClick={() => void pick()} disabled={!classId || spinning}>
        <i className="fas fa-dice" /> {spinning ? 'Đang quay…' : 'Bốc thăm'}
      </Button>
      {spinning && <p className="mt-4 flex animate-pulse justify-center gap-2 text-2xl text-blue-900"><i className="fas fa-bullseye" /><i className="fas fa-bullseye" /><i className="fas fa-bullseye" /></p>}
      {picked && !spinning && (
        <div className="mt-5 rounded-sm border border-amber-200 bg-gradient-to-b from-amber-50 to-transparent p-5">
          {picked.map((p) => (
            <p key={p.id} className="py-1 text-2xl font-bold text-amber-700"><i className="fas fa-champagne-glasses" /> {p.displayName}</p>
          ))}
        </div>
      )}
    </Card>
  );
}

function BonusPanel({ sessionId }: { sessionId: string }) {
  const [vals, setVals] = useState({ first: 1, second: 0.5, third: 0.25 });
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    try {
      await api(`/games/${sessionId}/bonus`, { method: 'POST', body: JSON.stringify(vals) });
      toast.success('Đã cộng thưởng vào cột KTTX cho top 3');
      setApplied(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  if (applied) return <p className="mt-4 text-sm text-emerald-600"><i className="fas fa-check" /> Đã cộng thưởng KTTX cho top 3</p>;

  return (
    <div className="mt-5 rounded-sm border border-slate-200 bg-slate-50 p-4">
      <h4 className="mb-2 text-sm font-semibold text-slate-700">Cộng điểm KTTX thưởng cho top 3</h4>
      <div className="flex items-end justify-center gap-3">
        {(['first', 'second', 'third'] as const).map((key, i) => (
          <div key={key} className="text-center">
            <Label>
              <i className={`fas fa-medal ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-slate-400' : 'text-amber-600'}`} />
            </Label>
            <Select
              value={String(vals[key])}
              onChange={(e) => setVals((v) => ({ ...v, [key]: Number(e.target.value) }))}
              className="!w-20 !py-1.5 text-center"
            >
              <option value={0}>—</option>
              <option value={0.25}>+0.25</option>
              <option value={0.5}>+0.5</option>
              <option value={1}>+1</option>
            </Select>
          </div>
        ))}
      </div>
      <Button className="mt-3" onClick={() => void apply()} disabled={busy}>
        Cộng vào sổ điểm
      </Button>
    </div>
  );
}
