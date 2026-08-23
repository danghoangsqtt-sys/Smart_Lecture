import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { getSocket, disconnectSocket } from '../realtime/socket';
import { Button, Card, EmptyState, Input, Label, PageHeader, Select, Spinner } from '../components/ui';
import toast from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import { useMyClasses } from './LecturesPage';

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

export default function GamesPage() {
  const [tab, setTab] = useState<'create' | 'picker'>('create');

  return (
    <div>
      <PageHeader title="TrÃ² chÆ¡i" subtitle="Kiá»ƒm tra bÃ i cÅ© ngay trÃªn lá»›p â€” há»c viÃªn tham gia báº±ng tÃ i khoáº£n" />
      <div className="mb-5 flex gap-1 rounded-xl bg-slate-900 p-1 ring-1 ring-slate-800 w-fit">
        {([['create', 'Tráº¯c nghiá»‡m nhanh'], ['picker', 'Bá»‘c thÄƒm ngáº«u nhiÃªn']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === k ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>{l}</button>
        ))}
      </div>
      {tab === 'create' ? <CreateGameTab /> : <RandomPickerTab />}
    </div>
  );
}

function CreateGameTab() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [secondsPerQuestion, setSeconds] = useState(20);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ questions: Question[] }>('/questions?type=mcq&limit=500')
      .then((r) => setQuestions(r.questions))
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => disconnectSocket();
  }, []);

  async function create() {
    try {
      const res = await api<{ id: string; roomCode: string }>('/games', {
        method: 'POST',
        body: JSON.stringify({ gameType: 'quick_quiz', questionIds: [...selectedIds], secondsPerQuestion }),
      });
      toast.success(`ÄÃ£ táº¡o phÃ²ng ${res.roomCode}`);
      setSession({
        id: res.id,
        roomCode: res.roomCode,
        gameType: 'quick_quiz',
        status: 'lobby',
        questionCount: selectedIds.size,
        config: { title: '', secondsPerQuestion },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i táº¡o game');
    }
  }

  if (session) return <HostConsole session={session} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card className="p-5">
        <h3 className="mb-3 font-medium text-slate-200">Chá»n cÃ¢u há»i tráº¯c nghiá»‡m ({selectedIds.size} Ä‘Ã£ chá»n)</h3>
        {loading ? <Spinner /> : questions.length === 0 ? (
          <EmptyState message="NgÃ¢n hÃ ng chÆ°a cÃ³ cÃ¢u tráº¯c nghiá»‡m nÃ o" />
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
      <Card className="h-fit p-5">
        <Label>GiÃ¢y má»—i cÃ¢u (5â€“120)</Label>
        <Input type="number" min={5} max={120} value={secondsPerQuestion} onChange={(e) => setSeconds(Math.min(120, Math.max(5, Number(e.target.value))))} />
        <p className="mt-3 text-xs text-slate-500">Há»c viÃªn tráº£ lá»i nhanh hÆ¡n sáº½ Ä‘Æ°á»£c nhiá»u Ä‘iá»ƒm hÆ¡n (60 Ä‘iá»ƒm ná»n + tá»‘i Ä‘a 40 Ä‘iá»ƒm tá»‘c Ä‘á»™).</p>
        <Button className="mt-4 w-full" onClick={() => void create()} disabled={selectedIds.size === 0}>
          Táº¡o phÃ²ng game
        </Button>
      </Card>
    </div>
  );
}

function HostConsole({ session }: { session: SessionInfo }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'lobby' | 'question' | 'leaderboard' | 'finished'>('lobby');
  const [players, setPlayers] = useState<{ name: string; score?: number }[]>([]);
  const [reveal, setReveal] = useState<{ correctIdx: number; counts: number[]; correctCount: number; playerCount: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ name: string; score: number }[]>([]);
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    const socket = getSocket(token);
    socketRef.current = socket;

    socket.emit('game:host-attach', { sessionId: session.id });

    socket.on('host:sync', (d: { phase: typeof phase; players: { name: string; score: number }[] }) => {
      setPhase(d.phase);
      setPlayers(d.players);
    });
    socket.on('lobby:update', (d: { players: { name: string }[] }) => setPlayers(d.players));
    socket.on('question:show', () => { setPhase('question'); setReveal(null); });
    socket.on('answer:reveal', (d: { correctIdx: number; counts: number[]; correctCount: number; playerCount: number }) => {
      setPhase('leaderboard');
      setReveal(d);
    });
    socket.on('leaderboard:update', (d: { rows: { name: string; score: number }[] }) => setLeaderboard(d.rows));
    socket.on('game:finished', () => { setPhase('finished'); });
    socket.on('game:error', (d: { message: string }) => toast.error(d.message));

    return () => {
      socket.off();
    };
  }, [session.id]);

  function hostNext() {
    socketRef.current?.emit('game:host-next');
  }
  function hostStart() {
    socketRef.current?.emit('game:host-start');
  }

  async function cancel() {
    if (!window.confirm('Káº¿t thÃºc vÃ  Ä‘Ã³ng phÃ²ng game?')) return;
    try {
      await api(`/games/${session.id}/cancel`, { method: 'POST' });
      disconnectSocket();
      navigate('/games');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i');
    }
  }

  const totalQuestions = session.questionCount;

  return (
    <div className="mx-auto max-w-2xl text-center">
      <Card className="mb-5 p-6">
        <p className="text-sm text-slate-400">MÃ£ phÃ²ng â€” há»c viÃªn nháº­p táº¡i trang TrÃ² chÆ¡i</p>
        <div className="my-2 font-mono text-6xl font-bold tracking-widest text-indigo-300">{session.roomCode}</div>
        <BadgeInline>{players.length} há»c viÃªn trong phÃ²ng</BadgeInline>
      </Card>

      {phase === 'lobby' && (
        <>
          <Card className="mb-5 p-4">
            <h3 className="mb-2 font-medium">Danh sÃ¡ch chá»</h3>
            {players.length === 0 ? (
              <p className="py-4 text-sm text-slate-500">ChÆ°a cÃ³ ai tham giaâ€¦</p>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {players.map((p, i) => (
                  <span key={i} className="rounded-full bg-slate-800 px-3 py-1 text-sm">{p.name}</span>
                ))}
              </div>
            )}
          </Card>
          <Button className="!px-8 !py-3 !text-base" onClick={hostStart} disabled={players.length === 0}>â–¶ Báº¯t Ä‘áº§u</Button>
        </>
      )}

      {phase !== 'lobby' && phase !== 'finished' && (
        <Card className="p-6">
          <p className="mb-3 text-sm text-slate-400">Nháº¥n Ä‘á»ƒ chuyá»ƒn bÆ°á»›c tiáº¿p theo (hiá»‡n Ä‘Ã¡p Ã¡n â†’ cÃ¢u sau â†’ â€¦)</p>
          {reveal && (
            <div className="mb-4 rounded-xl bg-slate-950/60 p-4">
              <p className="text-emerald-400">âœ“ ÄÃ¡p Ã¡n Ä‘Ãºng: {String.fromCharCode(65 + reveal.correctIdx)} Â· {reveal.correctCount}/{reveal.playerCount} Ä‘Ãºng</p>
              <div className="mt-2 flex gap-1.5">
                {reveal.counts.map((c, i) => (
                  <div key={i} className={`flex-1 rounded py-1 text-sm font-bold ${i === reveal.correctIdx ? 'bg-emerald-800' : 'bg-slate-800'}`}>{c}</div>
                ))}
              </div>
            </div>
          )}
          {phase === 'leaderboard' && leaderboard.length > 0 && (
            <ol className="mb-4 space-y-1">
              {leaderboard.slice(0, 10).map((r, i) => (
                <li key={i} className={`flex justify-between rounded-lg px-3 py-1.5 text-sm ${i === 0 ? 'bg-amber-800/40' : i === 1 ? 'bg-slate-700/60' : i === 2 ? 'bg-orange-900/30' : ''}`}>
                  <span>{i + 1}. {r.name}</span><b>{r.score}</b>
                </li>
              ))}
            </ol>
          )}
          <Button onClick={hostNext}>{phase === 'question' ? 'Háº¿t giá» / hiá»‡n Ä‘Ã¡p Ã¡n' : 'CÃ¢u tiáº¿p theo â–¶'}</Button>
          <p className="mt-2 text-xs text-slate-600">Tá»•ng {totalQuestions} cÃ¢u Â· Ä‘ang á»Ÿ vá»‹ trÃ­ hiá»ƒn thá»‹ tá»± Ä‘á»™ng theo server</p>
        </Card>
      )}

      {phase === 'finished' && (
        <Card className="p-6">
          <h3 className="mb-4 text-xl font-bold">ðŸ† Báº£ng vÃ ng</h3>
          <ol className="space-y-1.5">
            {leaderboard.map((r, i) => (
              <li key={i} className={`flex justify-between rounded-lg px-4 py-2 ${i === 0 ? 'bg-gradient-to-r from-amber-700/50 to-transparent text-lg font-bold' : i < 3 ? 'bg-slate-800' : 'bg-slate-800/60 text-sm'}`}>
                <span>{['ðŸ¥‡', 'ðŸ¥ˆ', 'ðŸ¥‰'][i] ?? `${i + 1}.`} {r.name}</span><b>{r.score}</b>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <button onClick={() => void cancel()} className="mt-6 text-xs text-red-400 hover:text-red-300">ÄÃ³ng phÃ²ng game</button>
    </div>
  );
}

function BadgeInline({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-indigo-950 px-2 py-1 text-sm text-indigo-300 ring-1 ring-indigo-800">{children}</span>;
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
      toast.error(e instanceof Error ? e.message : 'Lá»—i bá»‘c thÄƒm');
      setSpinning(false);
    }
  }, [classId, count]);

  return (
    <Card className="mx-auto max-w-md p-6 text-center">
      <h3 className="font-medium text-slate-200">Bá»‘c thÄƒm há»c viÃªn phÃ¡t biá»ƒu</h3>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="text-left"><Label>Lá»›p</Label>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div className="text-left"><Label>Sá»‘ ngÆ°á»i</Label>
          <Select value={count} onChange={(e) => setCount(Number(e.target.value) as 1 | 2)}>
            <option value={1}>1 há»c viÃªn</option><option value={2}>2 há»c viÃªn</option>
          </Select>
        </div>
      </div>
      <Button className="mt-5 w-full !py-3" onClick={() => void pick()} disabled={!classId || spinning}>
        ðŸŽ² {spinning ? 'Äang quayâ€¦' : 'Bá»‘c thÄƒm'}
      </Button>
      {spinning && <p className="mt-4 animate-pulse text-2xl">ðŸŽ¯ ðŸŽ¯ ðŸŽ¯</p>}
      {picked && !spinning && (
        <div className="mt-5 rounded-2xl bg-gradient-to-b from-amber-800/30 to-transparent p-5 ring-1 ring-amber-800/50">
          {picked.map((p) => (
            <p key={p.id} className="py-1 text-2xl font-bold text-amber-300">ðŸŽ‰ {p.displayName}</p>
          ))}
        </div>
      )}
    </Card>
  );
}
