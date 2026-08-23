import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, disconnectSocket } from '../realtime/socket';
import { Button, Card, Input, PageHeader } from '../components/ui';
import toast from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';

interface QuestionShow {
  index: number;
  total: number;
  question: { id: string; type: string; content: string; options: string[] };
  endsAt: number;
  durationSec: number;
}

type Mode = 'quick_quiz' | 'tug_of_war' | 'math_race';

export default function GamePlayPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [roomInput, setRoomInput] = useState('');
  const [joined, setJoined] = useState(false);
  const [gameType, setGameType] = useState<Mode>('quick_quiz');
  const [myTeam, setMyTeam] = useState<'A' | 'B' | undefined>(undefined);
  const [question, setQuestion] = useState<QuestionShow | null>(null);
  const [reveal, setReveal] = useState<{ correctIdx: number; correctText?: string; counts: number[]; correctCount: number; playerCount: number } | null>(null);
  const [, setLeaderboardRows] = useState<{ name: string; score: number }[]>([]);
  const [ropePos, setRopePos] = useState(0);
  const [tugResult, setTugResult] = useState<{ winnerTeam: 'A' | 'B'; teamA: number; teamB: number } | null>(null);
  const [mathProblem, setMathProblem] = useState<{ text: string; endsAt: number } | null>(null);
  const [mathInput, setMathInput] = useState('');
  const [mathSolved, setMathSolved] = useState(0);
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const [fillText, setFillText] = useState('');
  const [raceRows, setRaceRows] = useState<{ name: string; solved: number }[]>([]);
  const [finished, setFinished] = useState<{ rank: number; name: string; score: number }[] | null>(null);
  const [error, setError] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socketRef.current = socket;

    socket.on('game:error', (d: { message: string }) => setError(d.message));
    socket.on('game:joined', (d: { gameType: Mode; phase: string; team?: 'A' | 'B'; endsAt?: number }) => {
      setGameType(d.gameType);
      setMyTeam(d.team);
      if (d.gameType === 'math_race') setRaceEndsAtSafe(d.endsAt ?? 0);
    });
    socket.on('question:show', (d: QuestionShow) => {
      setQuestion(d);
      setReveal(null);
      setMyAnswer(null);
      setFillText('');
      setNowTick(Date.now());
    });
    socket.on('answer:reveal', (d: { correctIdx: number; correctText?: string; counts: number[]; correctCount: number; playerCount: number }) => {
      setReveal(d);
    });
    socket.on('leaderboard:update', (d: { rows: { name: string; score: number }[] }) => setLeaderboardRows(d.rows));
    socket.on('tug:update', (d: { ropePos: number }) => setRopePos(d.ropePos));
    socket.on('tug:result', (d: { winnerTeam: 'A' | 'B'; teamA: number; teamB: number }) => setTugResult(d));
    socket.on('race:start', (d: { endsAt: number }) => setRaceEndsAtSafe(d.endsAt));
    socket.on('math:problem', (d: { text: string; endsAt: number }) => {
      setMathProblem(d);
      setMathInput('');
    });
    socket.on('math:wrong', () => toast.error('Chưa đúng — thử lại!'));
    socket.on('race:update', (d: { rows: { name: string; solved: number }[] }) => setRaceRows(d.rows));
    socket.on('game:finished', (d: { podium: { rank: number; name: string; score: number }[] }) => {
      setFinished(d.podium);
      setQuestion(null);
      setMathProblem(null);
    });

    return () => { socket.off(); disconnectSocket(); };
  }, [token]);

  const [raceEndsAt, setRaceEndsAtState] = useState(0);
  function setRaceEndsAtSafe(v: number) { setRaceEndsAtState(v); }
  void raceEndsAt;

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  function join() {
    if (!/^\d{6}$/.test(roomInput)) {
      toast.error('Mã phòng gồm 6 chữ số');
      return;
    }
    socketRef.current?.emit('game:join', { roomCode: roomInput });
    setJoined(true);
  }

  function answer(choiceIdx: number, text?: string) {
    if (!question || myAnswer !== null || reveal) return;
    setMyAnswer(text ? -1 : choiceIdx);
    const msTaken = Date.now() - (question.endsAt - question.durationSec * 1000);
    socketRef.current?.emit('game:answer', { choiceIdx, text, msTaken });
  }

  function submitMath() {
    if (!mathProblem || mathInput.trim() === '') return;
    socketRef.current?.emit('math:answer', { answer: mathInput.trim() });
    setMathSolved((s) => s + 1);
  }

  if (!token) {
    void navigate('/login');
    return null;
  }

  const secondsLeft = question ? Math.max(0, Math.ceil((question.endsAt - nowTick) / 1000)) : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Tham gia trò chơi" subtitle="Nhập mã phòng giáo viên đang chiếu" />

      {!joined && (
        <Card className="p-6 text-center">
          <Input
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Mã phòng 6 số"
            className="mx-auto mt-2 !w-48 text-center !text-3xl font-bold tracking-[0.3em]"
          />
          <Button className="mt-4 w-full" onClick={join}>Vào phòng</Button>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </Card>
      )}

      {joined && finished && (
        <Card className="p-6 text-center">
          {tugResult && (
            <p className={`mb-3 text-xl font-bold ${tugResult.winnerTeam === 'A' ? 'text-blue-300' : 'text-red-300'}`}>
              🏆 Đội {tugResult.winnerTeam} kéo thắng! ({tugResult.teamA}đ – {tugResult.teamB}đ)
            </p>
          )}
          <h3 className="text-xl font-bold">Kết quả</h3>
          <ol className="mt-4 space-y-1.5 text-left">
            {finished.map((r) => (
              <li key={r.rank} className={`flex justify-between rounded-lg px-4 py-2 ${r.rank === 1 ? 'bg-gradient-to-r from-amber-700/50 to-transparent text-lg font-bold' : 'bg-slate-800/60'}`}>
                <span>{['🥇', '🥈', '🥉'][r.rank - 1] ?? `${r.rank}.`} {r.name}</span>
                <b>{r.score}{gameType === 'math_race' ? ' bài' : ' đ'}</b>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* ===== ĐUA TOÁN ===== */}
      {joined && !finished && gameType === 'math_race' && (
        <>
          {myTeam && <p className="hidden" />}
          <Card className="p-6 text-center">
            {mathProblem && (
              <>
                <p className="text-xs uppercase tracking-wide text-slate-500">Giải nhanh — đã giải {mathSolved} bài</p>
                <p className="my-6 text-5xl font-extrabold tracking-wide text-indigo-200">{mathProblem.text} = ?</p>
                <form onSubmit={(e) => { e.preventDefault(); submitMath(); }} className="flex gap-2">
                  <Input
                    autoFocus
                    inputMode="numeric"
                    value={mathInput}
                    onChange={(e) => setMathInput(e.target.value)}
                    placeholder="Đáp án…"
                    className="!py-3 text-center !text-xl"
                  />
                  <Button type="submit" className="!px-6">Gửi</Button>
                </form>
              </>
            )}
            {!mathProblem && <p className="animate-pulse py-8">⏳ Chờ giáo viên bắt đầu đua…</p>}
            {raceRows.length > 0 && (
              <div className="mt-6 border-t border-slate-800 pt-4">
                <h4 className="mb-2 text-sm font-medium text-slate-400">Bảng đua</h4>
                <ol className="space-y-1 text-left text-sm">
                  {raceRows.slice(0, 10).map((r, i) => (
                    <li key={i} className="flex justify-between rounded-lg bg-slate-800/60 px-3 py-1.5">
                      <span>{i + 1}. {r.name}</span><b>{r.solved}</b>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ===== QUIZ / KÉO CO / ĐIỀN CHỖ TRỐNG ===== */}
      {joined && !finished && gameType !== 'math_race' && myTeam && (
        <div className={`mb-3 rounded-xl px-4 py-2 text-center text-sm font-semibold ring-1 ${myTeam === 'A' ? 'bg-blue-950/60 text-blue-300 ring-blue-800' : 'bg-red-950/60 text-red-300 ring-red-800'}`}>
          Bạn thuộc 🅰 Đội A / Đội B — {myTeam === 'A' ? 'ĐỘI A (xanh)' : 'ĐỘI B (đỏ)'}
        </div>
      )}

      {joined && !finished && gameType === 'tug_of_war' && (
        <div className="mb-4 rounded-xl bg-slate-900 p-4 ring-1 ring-slate-800">
          <div className="relative h-7 overflow-hidden rounded-full bg-slate-800">
            <div className="absolute left-1/2 top-0 h-full w-px bg-slate-500" />
            <div
              className="absolute top-0.5 h-6 w-9 rounded-lg bg-amber-400 transition-all duration-700"
              style={{ left: `calc(${50 + Math.max(-48, Math.min(48, ropePos * 0.48))}% - 18px)` }}
            >🪢</div>
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-slate-500"><span>◀ ĐỘI A THẮNG</span><span>ĐỘI B THẮNG ▶</span></div>
        </div>
      )}

      {joined && !finished && gameType !== 'math_race' && question && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-slate-400">Câu {question.index + 1}/{question.total}</span>
            <span className={`rounded-lg px-3 py-1 font-mono text-xl font-bold ${secondsLeft <= 5 ? 'bg-red-950 text-red-400' : 'bg-slate-800 text-emerald-400'}`}>{secondsLeft}s</span>
          </div>
          <Card className="p-5">
            <p className="whitespace-pre-wrap leading-relaxed">{question.question.content}</p>
          </Card>

          {question.question.type === 'mcq' ? (
            <div className={`mt-4 grid gap-2 ${question.question.options.length > 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {question.question.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => answer(i)}
                  disabled={myAnswer !== null || !!reveal || secondsLeft === 0}
                  className={`rounded-xl px-4 py-4 text-left text-sm transition disabled:opacity-80 ${
                    reveal
                      ? i === reveal.correctIdx
                        ? 'bg-emerald-700/70 ring-2 ring-emerald-400'
                        : myAnswer === i
                          ? 'bg-red-800/60'
                          : 'bg-slate-900 opacity-50'
                      : myAnswer === i
                        ? 'bg-indigo-600 ring-2 ring-indigo-300'
                        : 'bg-slate-800 hover:bg-slate-700 active:scale-[0.98]'
                  }`}
                >
                  <b className="mr-2">{String.fromCharCode(65 + i)}.</b>{opt.replace(/^([A-D])[\.\:\)]\s+/, '')}
                </button>
              ))}
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (fillText.trim()) answer(-1, fillText.trim()); }}
              className="mt-4 flex gap-2"
            >
              <Input
                autoFocus
                value={fillText}
                onChange={(e) => setFillText(e.target.value)}
                placeholder="Nhập đáp án điền vào chỗ trống…"
                disabled={myAnswer !== null || !!reveal || secondsLeft === 0}
                className="!py-3"
              />
              <Button type="submit" disabled={myAnswer !== null || !!reveal || secondsLeft === 0 || !fillText.trim()}>Gửi</Button>
            </form>
          )}

          {reveal && question.question.type === 'fill' && (
            <p className="mt-3 text-center text-sm text-emerald-400">✓ Đáp án đúng: <b>{reveal.correctText}</b> ({reveal.correctCount}/{reveal.playerCount} đúng)</p>
          )}
          {myAnswer !== null && !reveal && question.question.type === 'fill' && <p className="mt-3 animate-pulse text-center text-sm text-indigo-300">Đã gửi — chờ kết quả…</p>}
          {myAnswer !== null && !reveal && question.question.type === 'mcq' && <p className="mt-3 animate-pulse text-center text-sm text-indigo-300">Đã gửi đáp án — chờ kết quả…</p>}
        </>
      )}

      {joined && !finished && gameType !== 'math_race' && !question && (
        <Card className="p-8 text-center">
          <p className="animate-pulse text-lg">⏳ Đang chờ giáo viên bắt đầu…</p>
          <p className="mt-2 text-xs text-slate-500">Phòng {roomInput} · đã vào thành công{myTeam ? ` · đội ${myTeam}` : ''}</p>
        </Card>
      )}
    </div>
  );
}

