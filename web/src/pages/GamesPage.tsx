import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { getSocket, disconnectSocket } from '../realtime/socket';
import { Button, Card, EmptyState, Input, Label, PageHeader, Select, Spinner } from '../components/ui';
import toast from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import { useMyClasses } from './LecturesPage';

type GameMode = 'quick_quiz' | 'tug_of_war' | 'math_race' | 'hand_raise' | 'crossword';

interface Question {
  id: string;
  type: string;
  content: string;
}

interface SessionInfo {
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
  quick_quiz: { label: 'Trắc nghiệm nhanh', desc: 'Cả lớp cùng câu, điểm thưởng tốc độ', icon: '⚡' },
  tug_of_war: { label: 'Kéo co', desc: '2 đội giằng dây bằng câu trả lời đúng', icon: '🪢' },
  math_race: { label: 'Đua toán', desc: 'Mỗi HV giải càng nhiều càng tốt trong thời gian', icon: '🏁' },
  hand_raise: { label: 'Giơ tay trả lời', desc: 'HV giơ tay → GV chọn người trả lời → chấm đúng/sai → tự cộng điểm KTTX', icon: '✋' },
  crossword: { label: 'Ô chữ', desc: 'Giải từng hàng ngang mở dần từ khóa dọc — mỗi ô đúng cộng điểm KTTX', icon: '🧩' },
};

export default function GamesPage() {
  const [tab, setTab] = useState<GameMode | 'picker'>('quick_quiz');

  return (
    <div>
      <PageHeader title="Trò chơi" subtitle="Kiểm tra bài cũ ngay trên lớp — học viên tham gia bằng tài khoản" />
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl bg-slate-900 p-1 ring-1 ring-slate-800 w-fit">
        {(Object.keys(MODE_META) as GameMode[]).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
            {MODE_META[k].icon} {MODE_META[k].label}
          </button>
        ))}
        <button onClick={() => setTab('picker')} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === 'picker' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>
          🎲 Bốc thăm
        </button>
      </div>
      {tab === 'picker' ? (
        <RandomPickerTab />
      ) : (
        <>
          <Card className="mb-4 p-4 text-sm text-slate-400">{MODE_META[tab].desc}</Card>
          <CreateGameTab mode={tab} />
        </>
      )}
    </div>
  );
}

function CreateGameTab({ mode }: { mode: GameMode }) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [secondsPerQuestion, setSeconds] = useState(20);
  const [durationSec, setDurationSec] = useState(120);
  const [difficulty, setDifficulty] = useState(1);
  const [pointsPerCorrect, setPointsPerCorrect] = useState<0.25 | 0.5 | 1>(0.5);
  const [classId, setClassId] = useState('');
  const classes = useMyClasses();
  const [puzzleKeyword, setPuzzleKeyword] = useState('');
  const [puzzleRows, setPuzzleRows] = useState<{ clue: string; word: string }[]>([
    { clue: '', word: '' },
    { clue: '', word: '' },
  ]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(mode !== 'math_race');

  useEffect(() => {
    if (mode === 'math_race' || mode === 'crossword') { setLoading(false); return; }
    setLoading(true);
    api<{ questions: Question[] }>('/questions?limit=500')
      .then((r) => setQuestions(r.questions))
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => disconnectSocket();
  }, [mode]);

  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0].id);
  }, [classes, classId]);

  async function create() {
    try {
      const body: Record<string, unknown> = {
        gameType: mode,
        questionIds: mode === 'math_race' ? undefined : [...selectedIds],
        secondsPerQuestion,
        durationSec,
        difficulty,
      };
      if (mode === 'hand_raise') {
        body.pointsPerCorrect = pointsPerCorrect;
        body.classId = classId || undefined;
      }
      if (mode === 'crossword') {
        body.pointsPerCorrect = pointsPerCorrect;
        body.classId = classId || undefined;
        body.puzzle = {
          keyword: puzzleKeyword.trim(),
          rows: puzzleRows.map((r) => ({ clue: r.clue.trim(), word: r.word.trim() })),
        };
      }
      const res = await api<{ id: string; roomCode: string }>('/games', { method: 'POST', body: JSON.stringify(body) });
      toast.success(`Đã tạo phòng ${res.roomCode}`);
      setSession({ id: res.id, roomCode: res.roomCode, gameType: mode, status: 'lobby', questionCount: selectedIds.size, config: { title: '', secondsPerQuestion } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tạo game');
    }
  }

  if (session) return <HostConsole session={session} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      {mode !== 'math_race' && mode !== 'crossword' && (
        <Card className="p-5">
          <h3 className="mb-3 font-medium text-slate-200">Chọn câu hỏi ({selectedIds.size} đã chọn)</h3>
          {loading ? <Spinner /> : questions.length === 0 ? (
            <EmptyState message="Ngân hàng chưa có câu trắc nghiệm nào" />
          ) : (
            <ul className="max-h-96 space-y-1 overflow-y-auto pr-1">
              {questions.map((question) => (
                <li key={question.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(question.id)}
                      onChange={(e) =>
                        setSelectedIds((prev) => {
                          const n = new Set(prev);
                          if (e.target.checked) n.add(question.id); else n.delete(question.id);
                          return n;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{question.content}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {(mode === 'crossword') && (
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 font-medium text-slate-200">🧩 Thiết kế ô chữ</h3>
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div>
              <Label>Từ khóa dọc ({puzzleKeyword.trim().length} chữ cái)</Label>
              <Input
                value={puzzleKeyword}
                onChange={(e) => setPuzzleKeyword(e.target.value.toUpperCase().replace(/[^A-Za-zÀ-ỹà-ỹ\s]/g, '').slice(0, 10))}
                placeholder="VD: ĐIỆN"
                className="!text-lg font-bold tracking-widest"
              />
              <div className="mt-3 flex flex-col items-center gap-1 rounded-xl bg-slate-950/60 p-3 ring-1 ring-slate-800">
                {[...(puzzleKeyword || ' '.repeat(4))].slice(0, 10).map((ch, i) => (
                  <span key={i} className={`flex h-7 w-7 items-center justify-center rounded ${/\S/.test(ch) ? 'bg-indigo-600 font-bold text-white' : 'bg-slate-800 text-slate-600'}`}>
                    {/\S/.test(ch) ? ch : i + 1}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <Label>Hàng ngang — chữ thứ {`i`} của hàng phải trùng chữ thứ {`i`} của từ khóa</Label>
              <ul className="space-y-2">
                {puzzleRows.map((row, i) => {
                  const expected = puzzleKeyword[i]?.toUpperCase() ?? '?';
                  const given = row.word.toUpperCase().replace(/\s+/g, '');
                  const ok = given[i] === expected;
                  return (
                    <li key={i} className="flex items-start gap-2 rounded-xl p-2.5 ring-1 ring-slate-800">
                      <span className={`mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${ok ? 'bg-emerald-700' : 'bg-slate-700'}`}>
                        {expected}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Input value={row.clue} onChange={(e) => setPuzzleRows((rs) => rs.map((r, ri) => (ri === i ? { ...r, clue: e.target.value } : r)))} placeholder={`Gợi ý hàng ${i + 1}…`} className="!py-1.5 text-sm" />
                        <Input
                          value={row.word}
                          onChange={(e) => setPuzzleRows((rs) => rs.map((r, ri) => (ri === i ? { ...r, word: e.target.value } : r)))}
                          placeholder="Từ khóa hàng ngang…"
                          className={`!py-1.5 text-sm ${given && !ok ? '!border-red-600' : ''}`}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" onClick={() => setPuzzleRows((rs) => [...rs, { clue: '', word: '' }])} disabled={puzzleRows.length >= 10}>+ Hàng</Button>
                <Button variant="ghost" onClick={() => setPuzzleRows((rs) => rs.slice(0, -1))} disabled={puzzleRows.length <= 2}>− Bớt</Button>
              </div>
            </div>
          </div>
        </Card>
      )}
      <Card className={`h-fit p-5 ${mode === 'math_race' ? 'lg:col-span-2 max-w-md mx-auto w-full' : ''}`}>
        {mode === 'math_race' ? (
          <>
            <Label>Thời lượng (giây, 30–600)</Label>
            <Input type="number" min={30} max={600} value={durationSec} onChange={(e) => setDurationSec(Math.min(600, Math.max(30, Number(e.target.value))))} />
            <div className="mt-3"><Label>Độ khó</Label>
              <Select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
                <option value={1}>1 — Cộng/trừ cơ bản</option>
                <option value={2}>2 — Nhân/chia</option>
                <option value={3}>3— Hỗn hợp nâng cao</option>
              </Select>
            </div>
            <p className="mt-3 text-xs text-slate-500">Mỗi học viên nhận bài toán riêng, giải liên tục cho đến hết giờ. Ai giải nhiều nhất thắng.</p>
          </>
        ) : mode === 'crossword' ? (
          <div className="space-y-3">
            <div><Label>Lớp (để tự cộng điểm KTTX)</Label>
              <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>
            <div><Label>Điểm mỗi ô đúng</Label>
              <Select value={pointsPerCorrect} onChange={(e) => setPointsPerCorrect(Number(e.target.value) as 0.25 | 0.5 | 1)}>
                <option value={0.25}>+0.25</option><option value={0.5}>+0.5</option><option value={1}>+1</option>
              </Select>
            </div>
            <Button className="w-full" onClick={() => void create()}
              disabled={!puzzleKeyword.trim() || puzzleRows.some((r) => !r.clue.trim() || !r.word.trim())}>
              Tạo phòng ô chữ
            </Button>
          </div>
        ) : (
          <>
            {mode === 'hand_raise' && (
              <div className="mb-3 space-y-3">
                <div><Label>Lớp (để tự cộng điểm KTTX)</Label>
                  <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div><Label>Điểm mỗi câu đúng → cột KTTX</Label>
                  <Select value={pointsPerCorrect} onChange={(e) => setPointsPerCorrect(Number(e.target.value) as 0.25 | 0.5 | 1)}>
                    <option value={0.25}>+0.25</option><option value={0.5}>+0.5</option><option value={1}>+1</option>
                  </Select>
                </div>
              </div>
            )}
            <Label>Giây mỗi câu (5–120)</Label>
            <Input type="number" min={5} max={120} value={secondsPerQuestion} onChange={(e) => setSeconds(Math.min(120, Math.max(5, Number(e.target.value))))} />
            {mode === 'tug_of_war' && (
              <p className="mt-3 text-xs text-slate-500">Học viên tự động chia 2 đội xen kẽ khi vào phòng. Mỗi câu, đội có tỷ lệ đúng cao hơn sẽ kéo dây về phía mình.</p>
            )}
            {mode === 'quick_quiz' && (
              <p className="mt-3 text-xs text-slate-500">60 điểm nền + tối đa 40 điểm tốc độ cho mỗi câu đúng.</p>
            )}
            {mode === 'hand_raise' && (
              <p className="mt-3 text-xs text-slate-500">Không tính giờ. HV giơ tay trên máy → GV bấm chọn người → HS trả lời miệng → GV bấm Đúng/Sai. Đúng sẽ tự cộng vào cột KTTX của sổ điểm.</p>
            )}
          </>
        )}
        <Button className="mt-4 w-full" onClick={() => void create()} disabled={mode !== 'math_race' && mode !== 'crossword' && selectedIds.size === 0}>
          Tạo phòng game
        </Button>
      </Card>
    </div>
  );
}

function HostConsole({ session }: { session: SessionInfo }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'lobby' | 'question' | 'leaderboard' | 'race' | 'crossword' | 'finished'>('lobby');
  const [players, setPlayers] = useState<{ name: string; score?: number; team?: string }[]>([]);
  const [reveal, setReveal] = useState<{ correctIdx: number; correctText?: string; counts: number[]; correctCount: number; playerCount: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number }[]>([]);
  const [ropePos, setRopePos] = useState(0);
  const [teams, setTeams] = useState<{ A: TugTeam; B: TugTeam } | null>(null);
  const [tugResult, setTugResult] = useState<{ winnerTeam: 'A' | 'B'; teamA: number; teamB: number } | null>(null);
  const [raceRows, setRaceRows] = useState<{ name: string; solved: number }[]>([]);
  const [raceEndsAt, setRaceEndsAt] = useState(0);
  const [tick, setTick] = useState(0);
  const [hands, setHands] = useState<{ userId: string; name: string }[]>([]);
  const [picked, setPicked] = useState<{ userId: string; name: string } | null>(null);
  const [hrResult, setHrResult] = useState<{ name: string; correct: boolean; delta: number; newKttx: number | null } | null>(null);
  const [cwState, setCwState] = useState<{
    keywordRevealed: string[];
    rows: { index: number; clue: string; wordLen: number; solved: boolean; word: string | null }[];
    solvedCount: number;
    total: number;
  } | null>(null);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    if (phase !== 'race') return;
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    const socket = getSocket(token);
    socketRef.current = socket;

    socket.emit('game:host-attach', { sessionId: session.id });

    socket.on('host:sync', (d: { phase: typeof phase; players: { name: string; score: number }[]; ropePos: number }) => {
      setPhase(d.phase);
      setPlayers(d.players);
      setRopePos(d.ropePos ?? 0);
    });
    socket.on('lobby:update', (d: { players: { name: string; team?: string }[] }) => setPlayers(d.players));
    socket.on('question:show', () => { setPhase('question'); setReveal(null); setHrResult(null); });
    socket.on('answer:reveal', (d: { correctIdx: number; correctText?: string; counts: number[]; correctCount: number; playerCount: number }) => {
      setPhase('leaderboard');
      setReveal(d);
    });
    socket.on('leaderboard:update', (d: { rows: { name: string; score: number }[] }) => setLeaderboard(d.rows));
    socket.on('tug:update', (d: { ropePos: number; teamA: TugTeam; teamB: TugTeam }) => {
      setRopePos(d.ropePos);
      setTeams({ A: d.teamA, B: d.teamB });
    });
    socket.on('tug:result', (d: { winnerTeam: 'A' | 'B'; teamA: number; teamB: number }) => setTugResult(d));
    socket.on('race:start', (d: { endsAt: number }) => { setPhase('race'); setRaceEndsAt(d.endsAt); });
    socket.on('race:update', (d: { rows: { name: string; solved: number }[] }) => setRaceRows(d.rows));
    socket.on('game:finished', () => setPhase('finished'));
    socket.on('game:error', (d: { message: string }) => toast.error(d.message));

    socket.on('hr:hands-update', (d: { hands: { userId: string; name: string }[] }) => setHands(d.hands));
    socket.on('hr:selected', (d: { userId: string; name: string }) => setPicked(d));
    socket.on('hr:released', () => setPicked(null));
    socket.on('hr:result', (d: { name: string; correct: boolean; delta: number; newKttx: number | null }) => {
      setHrResult(d);
      setTimeout(() => setHrResult(null), 4000);
    });
    socket.on('cw:state', (d: { keywordRevealed: string[]; rows: { index: number; clue: string; wordLen: number; solved: boolean; word: string | null }[]; solvedCount: number; total: number }) => {
      setCwState(d);
      setPhase('crossword');
    });

    return () => { socket.off(); };
  }, [session.id]);

  function hostPick(userId: string) { socketRef.current?.emit('game:host-pick', { userId }); }
  function hostRelease() { socketRef.current?.emit('game:host-release'); }
  function hostVerdict(correct: boolean) {
    if (!picked) return;
    socketRef.current?.emit('game:host-verdict', { userId: picked.userId, correct });
  }

  function hostNext() { socketRef.current?.emit('game:host-next'); }
  function hostStart() { socketRef.current?.emit('game:start'); socketRef.current?.emit('game:host-start'); }

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
        <p className="text-sm text-slate-400">Mã phòng — học viên nhập tại trang Trò chơi</p>
        <div className="my-2 font-mono text-6xl font-bold tracking-widest text-indigo-300">{session.roomCode}</div>
        <span className="rounded-md bg-indigo-950 px-2 py-1 text-sm text-indigo-300 ring-1 ring-indigo-800">{players.length} học viên trong phòng</span>
      </Card>

      {phase === 'lobby' && (
        <>
          <Card className="mb-5 p-4">
            <h3 className="mb-2 font-medium">Danh sách chờ</h3>
            {players.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">Chưa có ai tham gia…</p>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {players.map((p, i) => (
                  <span key={i} className={`rounded-full px-3 py-1 text-sm ${p.team === 'A' ? 'bg-blue-900/70' : p.team === 'B' ? 'bg-red-900/70' : 'bg-slate-800'}`}>{p.name}</span>
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
            <div className={`mb-3 rounded-xl px-4 py-2.5 text-center text-sm font-semibold ring-1 ${hrResult.correct ? 'bg-emerald-950 text-emerald-300 ring-emerald-800' : 'bg-red-950 text-red-300 ring-red-800'}`}>
              {hrResult.correct ? `✅ ${hrResult.name} đúng — +${hrResult.delta} điểm KTTX${hrResult.newKttx !== null ? ` (KTTX hiện tại: ${hrResult.newKttx})` : ''}` : `❌ ${hrResult.name} chưa đúng`}
            </div>
          )}
          {picked ? (
            <div className="rounded-xl bg-indigo-950/60 p-4 text-center ring-1 ring-indigo-700">
              🙋 <b className="text-lg">{picked.name}</b> đang trả lời…
              <div className="mt-3 flex justify-center gap-3">
                <Button className="!px-6" onClick={() => hostVerdict(true)}>✓ Đúng</Button>
                <Button variant="danger" className="!px-6" onClick={() => hostVerdict(false)}>✗ Sai</Button>
                <Button variant="ghost" onClick={hostRelease}>Bỏ qua</Button>
              </div>
            </div>
          ) : (
            <>
              <h4 className="mb-2 text-sm font-semibold text-slate-300">🙋 Đang giơ tay ({hands.length})</h4>
              {hands.length === 0 ? (
                <p className="py-3 text-center text-sm text-slate-500">Chưa ai giơ tay…</p>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  {hands.map((h) => (
                    <button key={h.userId} onClick={() => hostPick(h.userId)} className="rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600">
                      ✋ {h.name}
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
            <div className={`mb-3 rounded-xl px-4 py-2.5 text-center text-sm font-semibold ring-1 ${hrResult.correct ? 'bg-emerald-950 text-emerald-300 ring-emerald-800' : 'bg-red-950 text-red-300 ring-red-800'}`}>
              {hrResult.correct ? `🎉 ${hrResult.name} mở được hàng ô chữ — +${hrResult.delta}đ KTTX` : `❌ ${hrResult.name} chưa đúng`}
            </div>
          )}
          <div className="mb-4 flex justify-center gap-1.5">
            {cwState.keywordRevealed.map((ch, i) => (
              <span key={i} className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl font-extrabold ${ch !== '_' ? 'bg-indigo-600 text-white animate-pop' : 'bg-slate-800 text-slate-600'}`}>
                {ch}
              </span>
            ))}
          </div>
          <ul className="space-y-2">
            {cwState.rows.map((r) => (
              <li key={r.index} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${r.solved ? 'bg-emerald-950/40 ring-1 ring-emerald-800' : 'bg-slate-950/50 ring-1 ring-slate-800'}`}>
                <span className={`font-mono font-bold ${r.solved ? 'text-emerald-400' : 'text-indigo-400'}`}>{r.index + 1}</span>
                <span className="min-w-0 flex-1">
                  {r.solved ? <b className="tracking-wide text-emerald-300">{r.word}</b> : r.clue}
                </span>
                {!r.solved && <span className="text-xs text-slate-600">{r.wordLen} chữ</span>}
              </li>
            ))}
          </ul>
          {picked && (
            <p className="mt-3 rounded-lg bg-indigo-950/60 px-3 py-2 text-center text-sm text-indigo-200">🙋 <b>{picked.name}</b> đang trả lời trên máy của bạn ấy…</p>
          )}
        </Card>
      )}

      {session.gameType === 'tug_of_war' && phase !== 'lobby' && teams && (
        <Card className="mb-4 p-5">
          <div className="mb-2 flex justify-between text-sm font-semibold">
            <span className="text-blue-300">🅰 Đội A · {teams.A.score}đ</span>
            <span className="text-red-300">Đội B · {teams.B.score}đ 🅱</span>
          </div>
          <div className="relative h-8 overflow-hidden rounded-full bg-slate-800 ring-1 ring-slate-700">
            <div className="absolute left-1/2 top-0 h-full w-px bg-slate-500" />
            <div
              className={`absolute top-1 h-6 w-10 rounded-lg transition-all duration-700 ${ropePos >= 100 ? 'bg-blue-400' : ropePos <= -100 ? 'bg-red-400' : 'bg-amber-400'}`}
              style={{ left: `calc(${50 + Math.max(-48, Math.min(48, ropePos * 0.48))}% - 20px)` }}
            >🪢</div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Dây nghiêng về phía đội trả lời đúng nhiều hơn. Kéo tới bờ (±100) để thắng tuyệt đối!</p>
          {tugResult && (
            <p className={`mt-3 text-lg font-bold ${tugResult.winnerTeam === 'A' ? 'text-blue-300' : 'text-red-300'}`}>
              🏆 Đội {tugResult.winnerTeam} thắng!
            </p>
          )}
        </Card>
      )}

      {phase === 'race' && (
        <Card className="mb-4 p-6">
          <div className="mb-4 font-mono text-4xl font-bold text-emerald-400">{Math.floor(raceLeft / 60)}:{String(raceLeft % 60).padStart(2, '0')}</div>
          <h3 className="mb-3 font-medium">Bảng đua trực tiếp</h3>
          <ol className="space-y-1 text-left">
            {raceRows.map((r, i) => (
              <li key={i} className={`flex justify-between rounded-lg px-3 py-1.5 text-sm ${i === 0 ? 'bg-emerald-800/40' : 'bg-slate-800/60'}`}>
                <span>{i + 1}. {r.name}</span><b>{r.solved} bài</b>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {(phase === 'question' || phase === 'leaderboard') && session.gameType !== 'math_race' && (
        <Card className="p-6">
          <p className="mb-3 text-sm text-slate-400">{phase === 'question' ? 'Học viên đang trả lời… nhấn để hết giờ / hiện đáp án' : 'Nhấn để sang câu tiếp theo'}</p>
          {reveal && phase === 'leaderboard' && (
            <div className="mb-4 rounded-xl bg-slate-950/60 p-4">
              {session.gameType !== 'tug_of_war' && (
                <p className="text-emerald-400">
                  ✓ Đáp án đúng: {reveal.correctIdx >= 0 ? String.fromCharCode(65 + reveal.correctIdx) : reveal.correctText}
                  {' '}· {reveal.correctCount}/{reveal.playerCount} đúng
                </p>
              )}
              {session.gameType === 'tug_of_war' && (
                <p className="text-emerald-400">✓ {reveal.correctCount}/{reveal.playerCount} trả lời đúng — dây đã di chuyển</p>
              )}
              {reveal.counts.some((c) => c > 0) && (
                <div className="mt-2 flex gap-1.5">
                  {reveal.counts.map((c, i) => (
                    <div key={i} className={`flex-1 rounded py-1 text-sm font-bold ${i === reveal.correctIdx ? 'bg-emerald-800' : 'bg-slate-800'}`}>{c}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          {leaderboard.length > 0 && phase === 'leaderboard' && session.gameType !== 'tug_of_war' && (
            <ol className="mb-4 space-y-1">
              {leaderboard.slice(0, 10).map((r, i) => (
                <li key={i} className={`flex justify-between rounded-lg px-3 py-1.5 text-sm ${i === 0 ? 'bg-amber-800/40' : i === 1 ? 'bg-slate-700/60' : i === 2 ? 'bg-orange-900/30' : ''}`}>
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
          <h3 className="mb-4 text-xl font-bold">🏆 Kết quả cuối</h3>
          <ol className="space-y-1.5">
            {(session.gameType === 'math_race' ? raceRows.map((r) => ({ name: r.name, score: r.solved })) : leaderboard).map((r, i) => (
              <li key={i} className={`flex justify-between rounded-lg px-4 py-2 ${i === 0 ? 'bg-gradient-to-r from-amber-700/50 to-transparent text-lg font-bold' : i < 3 ? 'bg-slate-800' : 'bg-slate-800/60 text-sm'}`}>
                <span>{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} {r.name}</span><b>{r.score}{session.gameType === 'math_race' ? ' bài' : ' đ'}</b>
              </li>
            ))}
          </ol>

          {session.config && session.id && (
            <BonusPanel sessionId={session.id} />
          )}
        </Card>
      )}

      <button onClick={() => void cancel()} className="mt-6 text-xs text-red-400 hover:text-red-300">Đóng phòng game</button>
    </div>
  );
}

function RandomPickerTab() {
  const classes = useMyClasses();
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
      <h3 className="font-medium text-slate-200">Bốc thăm học viên phát biểu</h3>
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
        🎲 {spinning ? 'Đang quay…' : 'Bốc thăm'}
      </Button>
      {spinning && <p className="mt-4 animate-pulse text-2xl">🎯 🎯 🎯</p>}
      {picked && !spinning && (
        <div className="mt-5 rounded-2xl bg-gradient-to-b from-amber-800/30 to-transparent p-5 ring-1 ring-amber-800/50">
          {picked.map((p) => (
            <p key={p.id} className="py-1 text-2xl font-bold text-amber-300">🎉 {p.displayName}</p>
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

  if (applied) return <p className="mt-4 text-sm text-emerald-400">✓ Đã cộng thưởng KTTX cho top 3</p>;

  return (
    <div className="mt-5 rounded-xl bg-slate-950/50 p-4 ring-1 ring-slate-800">
      <h4 className="mb-2 text-sm font-semibold text-slate-300">Cộng điểm KTTX thưởng cho top 3</h4>
      <div className="flex items-end justify-center gap-3">
        {([['first', '🥇'], ['second', '🥈'], ['third', '🥉']] as const).map(([key, medal]) => (
          <div key={key} className="text-center">
            <Label>{medal}</Label>
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
