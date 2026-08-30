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

function shouldHideGameGuides(): boolean {
  try { return window.localStorage.getItem(GAME_GUIDE_PREFERENCE) === '1'; }
  catch { return false; }
}

type HostPhase = 'lobby' | 'question' | 'leaderboard' | 'race' | 'crossword' | 'sandbox' | 'finished';

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
  cdPending: { userId: string; name: string; circuit: any }[];
  csChallenge: { title: string; description: string; targetBehavior: string; index: number; total: number } | null;
  csPasses: { name: string; points: number; key: number }[];
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
    cdPending: [], csChallenge: null, csPasses: [],
  };
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
  const [guideMode, setGuideMode] = useState<GameMode | null>(() => autoShowGuides && !shouldHideGameGuides() ? 'quick_quiz' : null);

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

  if (session) return <HostConsole session={session} />;

  return (
    <div>
      <PageHeader title="Trò chơi" subtitle="Kiểm tra bài cũ ngay trên lớp — học viên tham gia bằng tài khoản" actions={
        tab !== 'picker' && tab !== 'saved' ? <Button variant="secondary" onClick={() => setGuideMode(tab)}><i className="fas fa-circle-play" /> Cách chơi</Button> : undefined
      } />
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
        <p className="text-[10px] italic leading-relaxed text-slate-400">Bỏ trống để dùng bộ 4 thử thách mẫu <b>Đèn LED · Cổng AND · Mạch NOT · D Flip-Flop</b> — đã có sẵn mạch tham chiếu, chấm tự động.</p>
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
    if (phase !== 'race') return;
    const t = setInterval(() => setField('tick', (x) => x + 1), 500);
    return () => clearInterval(t);
  }, [phase, setField]);

  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    const socket = getSocket(token);
    socketRef.current = socket;
    const socketEvents = createSocketEventScope(socket);
    const on = socketEvents.on;

    socket.emit('game:host-attach', { sessionId: sessionId });

    on('host:sync', (d: { phase: typeof phase; players: { name: string; score?: number; team?: string; userId?: string }[]; ropePos: number }) => {
      setField('phase', d.phase);
      setField('players', d.players);
      setField('ropePos', d.ropePos ?? 0);
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
    on('circuit_draw:submitted', (d: { userId: string; name: string; circuit: any }) => {
      setField('cdPending', (prev) => (prev.some((p) => p.userId === d.userId) ? prev : [...prev, { userId: d.userId, name: d.name, circuit: d.circuit }]));
      toast.info(`📥 ${d.name} đã nộp mạch`);
    });
    on('circuit_draw:verified', (d: { userId: string; name: string; correct: boolean }) => {
      setField('cdPending', (prev) => prev.filter((p) => p.userId !== d.userId));
      if (d.correct) toast.success(`✅ Mạch của ${d.name} đã được chấm ĐÚNG`);
      else toast.info(`↩ ${d.name} chưa khớp — học viên có thể nộp lại`);
    });
    on('circuit_simulate:challenge', (d: { index: number; total: number; challenge: { title: string; description: string; targetBehavior: string } }) => {
      setField('csChallenge', { ...d.challenge, index: d.index, total: d.total });
      setField('csPasses', []);
      setField('phase', 'sandbox');
    });
    on('circuit_simulate:challenge_passed', (d: { userId: string; name: string; points: number }) => {
      feedKey.current += 1;
      setField('csPasses', (prev) => [{ name: d.name, points: d.points, key: feedKey.current }, ...prev].slice(0, 8));
    });

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
  const {
    phase, players, reveal, leaderboard, ropePos, teams, tugResult, raceRows, raceEndsAt, tick,
    hands, picked, hrResult, cwState, joinQr,
  } = state;
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

  const raceLeft = Math.max(0, Math.ceil((raceEndsAt - Date.now()) / 1000));
  void tick;

  return (
    <div className="mx-auto max-w-2xl text-center">
      <Card className="mb-5 p-6">
        <p className="text-sm text-slate-500">Mã phòng — học viên nhập tại trang Trò chơi</p>
        <div className="my-2 font-mono text-6xl font-bold tracking-widest text-blue-900">{session.roomCode}</div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="flex items-center gap-1.5 rounded-sm border border-blue-200 bg-blue-50 px-2 py-1 text-sm text-blue-900"><i className="fas fa-users" /> {players.length}/60 thiết bị</span>
          {joinQr && <img src={joinQr} alt="QR vào thẳng trò chơi" className="mt-2 w-40 rounded-sm bg-white p-2" />}
          {joinQr && <p className="w-full text-center text-xs text-slate-500">Học viên quét mã → tự động vào phòng này</p>}
        </div>
      </Card>

      {phase === 'lobby' && (
        <>
          <Card className="mb-5 p-4">
            <h3 className="mb-2 font-semibold text-slate-800">Danh sách chờ</h3>
            {players.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">Chưa có ai tham gia…</p>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {players.map((p) => (
                  <span key={p.userId ?? p.name} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${p.team === 'A' ? 'border-blue-200 bg-blue-100 text-blue-900' : p.team === 'B' ? 'border-red-200 bg-red-100 text-red-700' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>
                    {p.name}
                    <button type="button" onClick={() => hostKick(p.userId ?? '')} aria-label={`Xóa người chơi ${p.name}`} className='text-xs text-red-400 hover:text-red-600'>×</button>
                  </span>
                ))}
              </div>
            )}
          </Card>
          <Button className="!px-8 !py-3 !text-base" onClick={hostStart} disabled={players.length === 0 && session.gameType !== 'math_race'}>▶ Bắt đầu</Button>
        </>
      )}

      {session.gameType === 'hand_raise' && phase !== 'lobby' && phase !== 'finished' && (
        <Card className="mb-4 p-5 text-left">
          {hrResult && (
            <div className={`mb-3 flex items-center justify-center gap-2 rounded-sm border px-4 py-2.5 text-center text-sm font-semibold ${hrResult.correct ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
              {hrResult.correct ? (
                <><i className="fas fa-circle-check" /> {hrResult.name} đúng — +{hrResult.delta} điểm KTTX{hrResult.newKttx !== null ? ` (KTTX hiện tại: ${hrResult.newKttx})` : ''}</>
              ) : (
                <><i className="fas fa-circle-xmark" /> {hrResult.name} chưa đúng</>
              )}
            </div>
          )}
          {picked ? (
            <div className="rounded-sm border border-blue-200 bg-blue-50 p-4 text-center">
              <i className="fas fa-hand-point-up text-blue-900" /> <b className="text-lg">{picked.name}</b> đang trả lời…
              <div className="mt-3 flex justify-center gap-3">
                <Button className="!px-6" onClick={() => hostVerdict(true)}><i className="fas fa-check" /> Đúng</Button>
                <Button variant="danger" className="!px-6" onClick={() => hostVerdict(false)}><i className="fas fa-xmark" /> Sai</Button>
                <Button variant="ghost" onClick={hostRelease}>Bỏ qua</Button>
              </div>
            </div>
          ) : (
            <>
              <h4 className="mb-2 text-sm font-semibold text-slate-700"><i className="fas fa-hand-point-up" /> Đang giơ tay ({hands.length})</h4>
              {hands.length === 0 ? (
                <p className="py-3 text-center text-sm text-slate-500">Chưa ai giơ tay…</p>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  {hands.map((h) => (
                    <button key={h.userId} onClick={() => hostPick(h.userId)} className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
                      <i className="fas fa-hand" /> {h.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {session.gameType === 'crossword' && cwState && phase !== 'lobby' && phase !== 'finished' && (
        <Card className="mb-4 p-5 text-left">
          {hrResult && (
            <div className={`mb-3 flex items-center justify-center gap-2 rounded-sm border px-4 py-2.5 text-center text-sm font-semibold ${hrResult.correct ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
              {hrResult.correct ? (
                <><i className="fas fa-champagne-glasses" /> {hrResult.name} mở được hàng ô chữ — +{hrResult.delta}đ KTTX</>
              ) : (
                <><i className="fas fa-circle-xmark" /> {hrResult.name} chưa đúng</>
              )}
            </div>
          )}
          <div className="mb-4 flex justify-center gap-1.5">
            {cwState.rows.map((row) => {
              const character = cwState.keywordRevealed[row.index] ?? '_';
              return <span key={`keyword-${row.index}`} className={`flex h-10 w-10 items-center justify-center rounded-sm text-xl font-extrabold ${character !== '_' ? 'bg-blue-900 text-white animate-pop' : 'bg-slate-200 text-slate-400'}`}>
                {character}
              </span>;
            })}
          </div>
          <ul className="space-y-2">
            {cwState.rows.map((r) => (
              <li key={r.index} className={`flex items-center gap-3 rounded-sm border px-3 py-2.5 text-sm ${r.solved ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <span className={`font-mono font-bold ${r.solved ? 'text-emerald-600' : 'text-blue-700'}`}>{r.index + 1}</span>
                <span className="min-w-0 flex-1">
                  {r.solved ? <b className="tracking-wide text-emerald-700">{r.word}</b> : r.clue}
                </span>
                {!r.solved && <span className="text-xs text-slate-400">{r.wordLen} chữ</span>}
              </li>
            ))}
          </ul>
          {picked && (
            <p className="mt-3 rounded-sm border border-blue-200 bg-blue-50 px-3 py-2 text-center text-sm text-blue-900"><i className="fas fa-hand-point-up" /> <b>{picked.name}</b> đang trả lời trên máy của bạn ấy…</p>
          )}
        </Card>
      )}

      <HostSandboxViews
        session={session}
        state={state}
        onQuizNext={qsNext}
        onCircuitVerify={circuitVerify}
      />

      {session.gameType === 'tug_of_war' && phase !== 'lobby' && teams && (
        <Card className="mb-4 p-5">
          <div className="mb-2 flex justify-between text-sm font-semibold">
            <span className="text-blue-700"><i className="fas fa-flag" /> Đội A · {teams.A.score}đ</span>
            <span className="text-red-600">Đội B · {teams.B.score}đ <i className="fas fa-flag" /></span>
          </div>
          <div className="relative h-8 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
            <div className="absolute left-1/2 top-0 h-full w-px bg-slate-300" />
            <div
              className={`absolute top-1 flex h-6 w-10 items-center justify-center rounded-full text-white transition-all duration-700 ${ropePos >= 100 ? 'bg-blue-600' : ropePos <= -100 ? 'bg-red-500' : 'bg-amber-500'}`}
              style={{ left: `calc(${50 + Math.max(-48, Math.min(48, ropePos * 0.48))}% - 20px)` }}
            ><i className="fas fa-people-pulling text-xs" /></div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Dây nghiêng về phía đội trả lời đúng nhiều hơn. Kéo tới bờ (±100) để thắng tuyệt đối!</p>
          {tugResult && (
            <p className={`mt-3 text-lg font-bold ${tugResult.winnerTeam === 'A' ? 'text-blue-700' : 'text-red-600'}`}>
              <i className="fas fa-trophy text-amber-500" /> Đội {tugResult.winnerTeam} thắng!
            </p>
          )}
        </Card>
      )}

      {phase === 'race' && (
        <Card className="mb-4 p-6">
          <div className="mb-4 font-mono text-4xl font-bold text-emerald-600">{Math.floor(raceLeft / 60)}:{String(raceLeft % 60).padStart(2, '0')}</div>
          <h3 className="mb-3 font-semibold text-slate-800">Bảng đua trực tiếp</h3>
          <ol className="space-y-1 text-left">
            {raceRows.map((r, i) => (
              <li key={r.name} className={`flex justify-between rounded-sm border px-3 py-1.5 text-sm ${i === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <span>{i + 1}. {r.name}</span><b>{r.solved} bài</b>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {(phase === 'question' || phase === 'leaderboard') && ['quick_quiz', 'tug_of_war'].includes(session.gameType) && (
        <Card className="p-6">
          <p className="mb-3 text-sm text-slate-500">{phase === 'question' ? 'Học viên đang trả lời… nhấn để hết giờ / hiện đáp án' : 'Nhấn để sang câu tiếp theo'}</p>
          {reveal && phase === 'leaderboard' && (
            <div className="mb-4 rounded-sm border border-slate-200 bg-slate-50 p-4">
              {session.gameType !== 'tug_of_war' && (
                <p className="text-emerald-600">
                  <i className="fas fa-check" /> Đáp án đúng: {reveal.correctIdx >= 0 ? String.fromCharCode(65 + reveal.correctIdx) : reveal.correctText}
                  {' '}· {reveal.correctCount}/{reveal.playerCount} đúng
                </p>
              )}
              {session.gameType === 'tug_of_war' && (
                <p className="text-emerald-600"><i className="fas fa-check" /> {reveal.correctCount}/{reveal.playerCount} trả lời đúng — dây đã di chuyển</p>
              )}
              {reveal.counts.some((c) => c > 0) && (
                <div className="mt-2 flex gap-1.5">
                  {reveal.counts.map((c, i) => {
                    const letter = String.fromCharCode(65 + i);
                    return <div key={letter} className={`flex-1 rounded-sm py-1 text-sm font-bold ${i === reveal.correctIdx ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>{c}</div>;
                  })}
                </div>
              )}
            </div>
          )}
          {leaderboard.length > 0 && phase === 'leaderboard' && session.gameType !== 'tug_of_war' && (
            <ol className="mb-4 space-y-1">
              {leaderboard.slice(0, 10).map((r, i) => (
                <li key={r.name} className={`flex justify-between rounded-sm border px-3 py-1.5 text-sm ${i === 0 ? 'border-amber-200 bg-amber-50' : i === 1 ? 'border-slate-200 bg-slate-100' : i === 2 ? 'border-orange-200 bg-orange-50' : 'border-transparent'}`}>
                  <span>{i + 1}. {r.name}</span><b>{r.score}</b>
                </li>
              ))}
            </ol>
          )}
          <Button onClick={hostNext}>{phase === 'question' ? '⏹ Hết giờ / hiện đáp án' : 'Câu tiếp theo ▶'}</Button>
        </Card>
      )}

      {phase === 'finished' && (
        <Card className="p-6">
          <h3 className="mb-4 text-xl font-bold text-slate-800"><i className="fas fa-trophy text-amber-500" /> Kết quả cuối</h3>
          <ol className="space-y-1.5">
            {(session.gameType === 'math_race' ? raceRows.map((r) => ({ name: r.name, score: r.solved })) : leaderboard).map((r, i) => (
              <li key={r.name} className={`flex justify-between rounded-sm border px-4 py-2 ${i === 0 ? 'border-amber-200 bg-gradient-to-r from-amber-100 to-transparent text-lg font-bold' : i < 3 ? 'border-slate-200 bg-slate-100' : 'border-slate-100 bg-slate-50 text-sm'}`}>
                <span>{i === 0 ? <i className="fas fa-medal text-yellow-500" /> : i === 1 ? <i className="fas fa-medal text-slate-400" /> : i === 2 ? <i className="fas fa-medal text-amber-600" /> : `${i + 1}.`} {r.name}</span><b>{r.score}{session.gameType === 'math_race' ? ' bài' : ' đ'}</b>
              </li>
            ))}
          </ol>

          {session.config && session.id && (
            <BonusPanel sessionId={session.id} />
          )}
        </Card>
      )}

      <button onClick={() => void cancel()} className="mt-6 text-xs text-red-500 hover:text-red-700">Đóng phòng game</button>
    </div>
  );
}

function HostSandboxViews({
  session,
  state,
  onQuizNext,
  onCircuitVerify,
}: {
  session: GameSessionInfo;
  state: HostConsoleState;
  onQuizNext: () => void;
  onCircuitVerify: (userId: string, correct: boolean) => void;
}) {
  const {
    phase, players, bingoLast, bingoCalled, bingoWinner, memBoard, memPairs, memFeed,
    scProgress, qsQ, qsIdx, qsTot, qsReveal, qsScores, cdPending, csChallenge, csPasses,
  } = state;
  const qsNext = onQuizNext;
  const circuitVerify = onCircuitVerify;
  return (
    <>
      {/* ===== HOST: BINGO ===== */}
      {session.gameType === 'bingo' && phase === 'sandbox' && (
        <Card className="mb-4 p-6">
          {bingoWinner ? (
            <div className="animate-bounce rounded-sm border-4 border-amber-400 bg-amber-50 p-8">
              <p className="text-center text-5xl font-black tracking-widest text-amber-600">BINGO!</p>
              <p className="mt-2 text-center text-2xl font-bold text-slate-800"><i className="fas fa-trophy text-amber-500" /> {bingoWinner}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-8">
                <div className="hidden gap-1 sm:grid sm:grid-cols-5">
                  {['B', 'I', 'N', 'G', 'O'].map((h) => (
                    <span key={h} className="flex h-10 w-10 items-center justify-center rounded-sm bg-blue-900 text-xl font-black text-white">{h}</span>
                  ))}
                </div>
                <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full border-8 border-blue-900 bg-white text-7xl font-black text-blue-900 shadow-xl">
                  {bingoLast ?? '—'}
                </div>
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-1">
                {bingoCalled.slice(-30).map((n, i, arr) => {
                  const isLast = i === arr.length - 1;
                  return (
                    <span key={`${n}-${i}`} className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isLast ? 'bg-amber-400 text-white ring-2 ring-amber-200' : 'bg-slate-200 text-slate-700'}`}>
                      {n}
                    </span>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-slate-500"><i className="fas fa-users" /> {players.length} học viên · đã gọi {bingoCalled.length}/75 số</p>
            </>
          )}
        </Card>
      )}

      {/* ===== HOST: LẬT THẺ ĐÔI ===== */}
      {session.gameType === 'memory_match' && phase === 'sandbox' && (
        <Card className="mb-4 p-5">
          <p className="mb-3 text-center text-sm font-semibold text-slate-700">
            <i className="fas fa-clone text-blue-700" /> Đã ghép <b className="text-emerald-600">{memPairs}/12</b> cặp
          </p>
          {memBoard.length > 0 && (
            <div className="mx-auto grid w-fit grid-cols-6 gap-2">
              {memBoard.map((c) => (
                <div
                  key={c.id}
                  className={`flex aspect-square w-12 items-center justify-center rounded-sm border text-base font-black transition-colors ${
                    c.matched
                      ? 'border-emerald-400 bg-emerald-100 text-emerald-700'
                      : c.value !== '?'
                        ? 'border-blue-300 bg-blue-50 text-blue-900'
                        : 'border-slate-300 bg-gradient-to-br from-slate-600 to-slate-800 text-transparent'
                  }`}
                >
                  {c.value}
                </div>
              ))}
            </div>
          )}
          {memFeed.length > 0 && (
            <ul className="mx-auto mt-3 max-w-xs space-y-1 text-left text-sm">
              {memFeed.map((f) => (
                <li key={f.key} className="rounded-sm bg-emerald-50 px-3 py-1 text-emerald-700">✅ {f.name} ghép đúng 1 cặp</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* ===== HOST: XẾP CHỮ ===== */}
      {session.gameType === 'word_scramble' && phase === 'sandbox' && (
        <Card className="mb-4 p-5 text-left">
          <h4 className="mb-2 text-sm font-semibold text-slate-700"><i className="fas fa-shuffle" /> Tiến độ xếp chữ</h4>
          {scProgress.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-500">Đang trộn chữ cái đầu tiên…</p>
          ) : (
            <ol className="space-y-1">
              {scProgress.map((p, i) => (
                <li key={p.userId} className={`flex justify-between rounded-sm border px-3 py-1.5 text-sm ${i === 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                  <span>{i + 1}. {p.name}</span><b>{p.solved} từ</b>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {/* ===== HOST: CHIẾC NÓN KỲ DỆU ===== */}
      {session.gameType === 'quiz_show' && phase === 'sandbox' && qsQ && (
        <Card className="mb-4 p-5 text-left">
          <div className="mb-2 flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <span>Câu {qsIdx + 1}/{qsTot}</span>
            {qsReveal && (
              <span className="text-emerald-600">
                Đáp án: {qsReveal.correctIdx >= 0 ? String.fromCharCode(65 + qsReveal.correctIdx) : qsReveal.correctText}
              </span>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed">{qsQ.content}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {qsQ.options.map((o, i) => {
              const letter = String.fromCharCode(65 + i);
              return <div
                key={letter}
                className={`rounded-sm border px-3 py-2 text-sm ${
                  qsReveal && i === qsReveal.correctIdx
                    ? 'border-emerald-400 bg-emerald-100 font-bold text-emerald-900'
                    : 'border-slate-200 bg-slate-50'
                }`}
              >
                <b>{letter}.</b> {o.replace(/^([A-D])[\.\:\)]\s+/, '')}
              </div>
            })}
          </div>
          {!qsReveal && <Button className="mt-4 w-full" onClick={qsNext}>Tự động hết giờ — hoặc sang câu tiếp theo ▶</Button>}
          {qsScores.length > 0 && (
            <ol className="mt-4 space-y-1 border-t border-slate-200 pt-3">
              {qsScores.slice(0, 10).map((s, i) => (
                <li key={s.name + i} className="flex justify-between rounded-sm border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm">
                  <span>{i + 1}. {s.name}{s.streak >= 3 && <span className="ml-1.5 text-xs text-orange-600">🔥{s.streak}</span>}</span>
                  <b>{s.score} đ</b>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {/* ===== HOST: VẼ MẠCH ===== */}
      {session.gameType === 'circuit_draw' && phase === 'sandbox' && (
        <Card className="mb-4 p-5 text-left">
          <h4 className="mb-2 text-sm font-semibold text-slate-700"><i className="fas fa-drafting-compass" /> Bài nộp chờ chấm ({cdPending.length})</h4>
          {cdPending.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-500">
              Chưa có bài nộp — học viên dựng mạch trên máy của họ rồi bấm “Nộp mạch”.
            </p>
          ) : (
            <ul className="space-y-3">
              {cdPending.map((p) => (
                <li key={p.userId} className="rounded-sm border border-blue-200 bg-blue-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-blue-900">📥 {p.name}</span>
                    <span className="flex gap-2">
                      <button onClick={() => circuitVerify(p.userId, true)} className="rounded-sm bg-emerald-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-emerald-700">
                        <i className="fas fa-check" /> Đúng +KTTX
                      </button>
                      <button onClick={() => circuitVerify(p.userId, false)} className="rounded-sm bg-red-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-red-700">
                        <i className="fas fa-xmark" /> Sai
                      </button>
                    </span>
                  </div>
                  {p.circuit && (
                    <div className="relative mt-2 h-48 overflow-hidden rounded-sm border border-slate-200 bg-white">
                      <CircuitCanvas gameType="circuit_draw" initialData={toCanvasData(p.circuit)} onChange={() => undefined} />
                      <div className="absolute inset-0" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* ===== HOST: MÔ PHỎNG MẠCH ===== */}
      {session.gameType === 'circuit_simulate' && phase === 'sandbox' && csChallenge && (
        <Card className="mb-4 border-l-4 border-l-blue-600 p-5 text-left">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Thử thách {csChallenge.index + 1}/{csChallenge.total}</p>
          <h4 className="mt-0.5 font-bold text-slate-800">{csChallenge.title}</h4>
          <p className="text-sm text-slate-600">{csChallenge.description}</p>
          <p className="mt-1 text-xs italic text-emerald-700"><i className="fas fa-bullseye" /> Mục tiêu: {csChallenge.targetBehavior}</p>
          {csPasses.length > 0 && (
            <ul className="mt-3 space-y-1">
              {csPasses.map((f) => (
                <li key={f.key} className="rounded-sm bg-emerald-50 px-3 py-1 text-sm text-emerald-700">
                  🎯 {f.name} vượt qua thử thách (+{f.points}đ → KTTX)
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

    </>
  );
}

/* Chuyển payload mạch (định dạng backend) → dữ liệu cho CircuitCanvas preview */
function toCanvasData(c: any): CircuitData {
  return {
    components: (c?.components ?? []).map((x: any) => ({
      id: String(x.id),
      type: String(x.type),
      x: Number(x.x) || 0,
      y: Number(x.y) || 0,
      rot: Number(x.rot ?? x.rotation ?? 0),
      props: (x.props ?? x.properties ?? {}) as Record<string, any>,
    })),
    wires: (c?.wires ?? []).map((w: any, i: number) => ({
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
