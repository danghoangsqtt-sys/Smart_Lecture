import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { getSocket, disconnectSocket } from '../realtime/socket';
import { Button, Card, EmptyState, Input, Label, PageHeader, Select, Spinner } from '../components/ui';
import toast from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import { useMyClasses } from './LecturesPage';

type GameMode = 'quick_quiz' | 'tug_of_war' | 'math_race';

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
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(mode !== 'math_race');

  useEffect(() => {
    if (mode === 'math_race') { setLoading(false); return; }
    setLoading(true);
    api<{ questions: Question[] }>('/questions?type=mcq&limit=500')
      .then((r) => setQuestions(r.questions))
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => disconnectSocket();
  }, [mode]);

  async function create() {
    try {
      const res = await api<{ id: string; roomCode: string }>('/games', {
        method: 'POST',
        body: JSON.stringify({
          gameType: mode,
          questionIds: mode === 'math_race' ? undefined : [...selectedIds],
          secondsPerQuestion,
          durationSec,
          difficulty,
        }),
      });
      toast.success(`Đã tạo phòng ${res.roomCode}`);
      setSession({ id: res.id, roomCode: res.roomCode, gameType: mode, status: 'lobby', questionCount: selectedIds.size, config: { title: '', secondsPerQuestion } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tạo game');
    }
  }

  if (session) return <HostConsole session={session} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      {mode !== 'math_race' && (
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
        ) : (
          <>
            <Label>Giây mỗi câu (5–120)</Label>
            <Input type="number" min={5} max={120} value={secondsPerQuestion} onChange={(e) => setSeconds(Math.min(120, Math.max(5, Number(e.target.value))))} />
            {mode === 'tug_of_war' && (
              <p className="mt-3 text-xs text-slate-500">Học viên tự động chia 2 đội xen kẽ khi vào phòng. Mỗi câu, đội có tỷ lệ đúng cao hơn sẽ kéo dây về phía mình.</p>
            )}
            {mode === 'quick_quiz' && (
              <p className="mt-3 text-xs text-slate-500">60 điểm nền + tối đa 40 điểm tốc độ cho mỗi câu đúng.</p>
            )}
          </>
        )}
        <Button className="mt-4 w-full" onClick={() => void create()} disabled={mode !== 'math_race' && selectedIds.size === 0}>
          Tạo phòng game
        </Button>
      </Card>
    </div>
  );
}

function HostConsole({ session }: { session: SessionInfo }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'lobby' | 'question' | 'leaderboard' | 'race' | 'finished'>('lobby');
  const [players, setPlayers] = useState<{ name: string; score?: number; team?: string }[]>([]);
  const [reveal, setReveal] = useState<{ correctIdx: number; correctText?: string; counts: number[]; correctCount: number; playerCount: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number }[]>([]);
  const [ropePos, setRopePos] = useState(0);
  const [teams, setTeams] = useState<{ A: TugTeam; B: TugTeam } | null>(null);
  const [tugResult, setTugResult] = useState<{ winnerTeam: 'A' | 'B'; teamA: number; teamB: number } | null>(null);
  const [raceRows, setRaceRows] = useState<{ name: string; solved: number }[]>([]);
  const [raceEndsAt, setRaceEndsAt] = useState(0);
  const [tick, setTick] = useState(0);
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
    socket.on('question:show', () => { setPhase('question'); setReveal(null); });
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

    return () => { socket.off(); };
  }, [session.id]);

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
