import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket, disconnectSocket } from '../realtime/socket';
import { Button, Card, Input, PageHeader } from '../components/ui';
import toast from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';

interface QuestionShow {
  index: number;
  total: number;
  question: { id: string; content: string; options: string[] };
  endsAt: number;
  durationSec: number;
}

export default function GamePlayPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const [roomInput, setRoomInput] = useState('');
  const [joined, setJoined] = useState(false);
  const [question, setQuestion] = useState<QuestionShow | null>(null);
  const [reveal, setReveal] = useState<{ correctIdx: number; counts: number[]; correctCount: number; playerCount: number } | null>(null);
  const [, setLeaderboard] = useState<{ name: string; score: number }[]>([]);
  const [myAnswer, setMyAnswer] = useState<number | null>(null);
  const [finished, setFinished] = useState<{ rank: number; name: string; score: number }[] | null>(null);
  const [error, setError] = useState('');
  const [nowTick, setNowTick] = useState(Date.now());
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socketRef.current = socket;

    socket.on('game:error', (d: { message: string }) => setError(d.message));
    socket.on('game:state', (d: { phase: string }) => {
      if (d.phase === 'lobby') setQuestion(null);
    });
    socket.on('question:show', (d: QuestionShow) => {
      setQuestion(d);
      setReveal(null);
      setMyAnswer(null);
      setNowTick(Date.now());
    });
    socket.on('answer:reveal', (d: { correctIdx: number; counts: number[]; correctCount: number; playerCount: number }) => {
      setReveal(d);
      setQuestion((q) => q); // giá»¯ nguyÃªn cÃ¢u Ä‘á»ƒ hiá»‡n Ä‘Ã¡p Ã¡n
    });
    socket.on('leaderboard:update', (d: { rows: { name: string; score: number }[] }) => setLeaderboard(d.rows));
    socket.on('game:finished', (d: { podium: { rank: number; name: string; score: number }[] }) => {
      setFinished(d.podium);
      setQuestion(null);
    });

    return () => {
      socket.off();
      disconnectSocket();
    };
  }, [token]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  function join() {
    if (!/^\d{6}$/.test(roomInput)) {
      toast.error('MÃ£ phÃ²ng gá»“m 6 chá»¯ sá»‘');
      return;
    }
    socketRef.current?.emit('game:join', { roomCode: roomInput });
    setJoined(true);
  }

  function answer(choiceIdx: number) {
    if (!question || myAnswer !== null || reveal) return;
    setMyAnswer(choiceIdx);
    const msTaken = Date.now() - (question.endsAt - question.durationSec * 1000);
    socketRef.current?.emit('game:answer', { choiceIdx, msTaken });
  }

  if (!token) {
    void navigate('/login');
    return null;
  }

  const secondsLeft = question ? Math.max(0, Math.ceil((question.endsAt - nowTick) / 1000)) : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Tham gia trÃ² chÆ¡i" subtitle="Nháº­p mÃ£ phÃ²ng giÃ¡o viÃªn Ä‘ang chiáº¿u" />
      {!joined && (
        <Card className="p-6 text-center">
          <Input
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="MÃ£ phÃ²ng 6 sá»‘"
            className="mx-auto mt-2 !w-48 text-center !text-3xl font-bold tracking-[0.3em]"
          />
          <Button className="mt-4 w-full" onClick={join}>VÃ o phÃ²ng</Button>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </Card>
      )}

      {joined && finished && (
        <Card className="p-6 text-center">
          <h3 className="text-xl font-bold">ðŸ† Káº¿t thÃºc</h3>
          <ol className="mt-4 space-y-1.5 text-left">
            {finished.map((r) => (
              <li key={r.rank} className={`flex justify-between rounded-lg px-4 py-2 ${r.rank === 1 ? 'bg-gradient-to-r from-amber-700/50 to-transparent text-lg font-bold' : 'bg-slate-800/60'}`}>
                <span>{['ðŸ¥‡', 'ðŸ¥ˆ', 'ðŸ¥‰'][r.rank - 1] ?? `${r.rank}.`} {r.name}</span><b>{r.score}</b>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {joined && !finished && question && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-slate-400">CÃ¢u {question.index + 1}/{question.total}</span>
            <span className={`rounded-lg px-3 py-1 font-mono text-xl font-bold ${secondsLeft <= 5 ? 'bg-red-950 text-red-400' : 'bg-slate-800 text-emerald-400'}`}>{secondsLeft}s</span>
          </div>
          <Card className="p-5">
            <p className="whitespace-pre-wrap leading-relaxed">{question.question.content}</p>
          </Card>
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
          {myAnswer !== null && !reveal && <p className="mt-3 animate-pulse text-center text-sm text-indigo-300">ÄÃ£ gá»­i Ä‘Ã¡p Ã¡n â€” chá» káº¿t quáº£â€¦</p>}
        </>
      )}

      {joined && !finished && !question && (
        <Card className="p-8 text-center">
          <p className="animate-pulse text-lg">â³ Äang chá» giÃ¡o viÃªn báº¯t Ä‘áº§uâ€¦</p>
          <p className="mt-2 text-xs text-slate-500">PhÃ²ng {roomInput} Â· Ä‘Ã£ vÃ o thÃ nh cÃ´ng</p>
        </Card>
      )}
    </div>
  );
}
