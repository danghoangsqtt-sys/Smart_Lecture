import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { createSocketEventScope, getSocket, disconnectSocket } from '../realtime/socket';
import { Button, Card, Input, Modal, PageHeader, Select } from '../components/ui';
import CircuitCanvas, { type CircuitData } from '../components/CircuitCanvas';
import toast from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';
import { useFieldReducer, type StateUpdate } from '../hooks/useFieldReducer';

interface QuestionShow {
  index: number;
  total: number;
  question: { id: string; type: string; content: string; options: string[] };
  endsAt: number;
  durationSec: number;
}

type Mode =
  | 'quick_quiz' | 'tug_of_war' | 'math_race' | 'hand_raise' | 'crossword'
  | 'bingo' | 'memory_match' | 'word_scramble' | 'quiz_show'
  | 'circuit_draw' | 'circuit_simulate';

interface BingoCell { n: number; marked: boolean }

interface CrosswordState {
  keywordRevealed: string[];
  rows: { index: number; clue: string; wordLen: number; solved: boolean; word: string | null }[];
  solvedCount: number;
  total: number;
}

interface PlayerGameState {
  roomInput: string;
  showGuide: boolean;
  joined: boolean;
  gameType: Mode;
  myTeam: 'A' | 'B' | undefined;
  question: QuestionShow | null;
  reveal: { correctIdx: number; correctText?: string; counts: number[]; correctCount: number; playerCount: number } | null;
  ropePos: number;
  tugResult: { winnerTeam: 'A' | 'B'; teamA: number; teamB: number } | null;
  mathProblem: { text: string; endsAt: number } | null;
  mathInput: string;
  mathSolved: number;
  myAnswer: number | null;
  fillText: string;
  raceRows: { name: string; solved: number }[];
  finished: { rank: number; name: string; score: number }[] | null;
  error: string;
  nowTick: number;
  iRaised: boolean;
  pickedMe: boolean;
  pickedName: string | null;
  cwState: CrosswordState | null;
  cwRow: number;
  cwWord: string;
  bingoCard: BingoCell[][] | null;
  bingoCalled: number[];
  bingoLast: number | null;
  memCards: { id: number; value: string; matched: boolean }[];
  memRevealed: number[];
  myMatches: number;
  scWord: { word: string; index: number; total: number } | null;
  scGuess: string;
  scSolved: number;
  qsQuestion: QuestionShow['question'] & { index: number; total: number } | null;
  qsReveal: { correctIdx: number; correctText?: string } | null;
  qsPicked: number | null;
  qsMasked: Set<number>;
  qsAudience: number[] | null;
  qsHint: string | null;
  qsLifelines: { fiftyFifty: boolean; askAudience: boolean; phoneFriend: boolean };
  scores: { name: string; score: number; streak: number }[];
  circuitData: CircuitData;
  challenge: {
    title: string;
    description: string;
    targetBehavior: string;
    index: number;
    total: number;
    paused: boolean;
    remainingMs: number;
  } | null;
  challengeCompleted: boolean;
  refCircuit: CircuitData | null;
  showRef: boolean;
}

type PlayerSetField = <Key extends keyof PlayerGameState>(
  key: Key,
  update: StateUpdate<PlayerGameState[Key]>,
) => void;

function createPlayerGameState(roomInput: string): PlayerGameState {
  return {
    roomInput, showGuide: false, joined: false, gameType: 'quick_quiz', myTeam: undefined,
    question: null, reveal: null, ropePos: 0, tugResult: null,
    mathProblem: null, mathInput: '', mathSolved: 0, myAnswer: null, fillText: '', raceRows: [],
    finished: null, error: '', nowTick: Date.now(), iRaised: false, pickedMe: false, pickedName: null,
    cwState: null, cwRow: 0, cwWord: '',
    bingoCard: null, bingoCalled: [], bingoLast: null,
    memCards: [], memRevealed: [], myMatches: 0,
    scWord: null, scGuess: '', scSolved: 0,
    qsQuestion: null, qsReveal: null, qsPicked: null, qsMasked: new Set(), qsAudience: null, qsHint: null,
    qsLifelines: { fiftyFifty: true, askAudience: true, phoneFriend: true }, scores: [],
    circuitData: { components: [], wires: [] }, challenge: null, challengeCompleted: false, refCircuit: null, showRef: false,
  };
}

const SANDBOX_MODES = new Set<Mode>(['bingo', 'memory_match', 'word_scramble', 'quiz_show', 'circuit_draw', 'circuit_simulate']);

function studentGuideFor(mode: Mode) {
  if (mode === 'tug_of_war') return { gif: '/game-guides/tug-guide.gif', title: 'Kéo co', rules: ['Bạn thuộc Đội A hoặc Đội B.', 'Mỗi câu đúng kéo dây về phía đội mình.', 'Đội chạm mốc cuối trước sẽ thắng.'] };
  if (mode === 'math_race') return { gif: '/game-guides/race-guide.gif', title: 'Đua toán', rules: ['Giải phép tính xuất hiện trên màn hình.', 'Đúng sẽ nhận bài mới ngay.', 'Ai giải đúng nhiều nhất sẽ thắng.'] };
  if (mode === 'crossword') return { gif: '/game-guides/crossword-guide.gif', title: 'Ô chữ', rules: ['Giơ tay để giáo viên chọn bạn trả lời.', 'Trả lời đúng mở một hàng ngang.', 'Mở đủ hàng để hoàn thành từ khóa dọc.'] };
  if (mode === 'quiz_show') return { gif: '/game-guides/show-guide.gif', title: 'Chiếc nón kỳ diệu', rules: ['Chọn đáp án trước khi hết giờ.', 'Dùng trợ giúp 50:50, hỏi khán giả hoặc gọi điện khi cần.', 'Giữ chuỗi câu đúng để tăng điểm.'] };
  if (mode === 'circuit_draw' || mode === 'circuit_simulate') return { gif: '/game-guides/activity-guide.gif', title: 'Thử thách mạch', rules: ['Lắp linh kiện và nối dây theo yêu cầu.', 'Chạy mô phỏng hoặc nộp mạch khi hoàn tất.', 'Chờ giáo viên xác nhận kết quả.'] };
  return { gif: '/game-guides/quiz-guide.gif', title: 'Quiz lớp học', rules: ['Chọn hoặc nhập đáp án trước khi hết giờ.', 'Hệ thống khóa câu trả lời sau khi gửi.', 'Theo dõi kết quả và bảng điểm sau mỗi câu.'] };
}

function serializeCircuitForRoom(data: CircuitData) {
  return {
    components: data.components.map((component) => ({
      id: component.id,
      type: component.type,
      x: component.x,
      y: component.y,
      rotation: component.rot,
      properties: component.props,
    })),
    wires: data.wires.map((wire) => ({
      id: wire.id,
      from: wire.from.split('::')[0],
      to: wire.to.split('::')[0],
      fromPort: wire.from.split('::')[1],
      toPort: wire.to.split('::')[1],
    })),
  };
}

function deserializeCircuitFromRoom(data: {
  components: Array<{
    id: string; type: string; x: number; y: number;
    rotation?: number; rot?: number;
    properties?: Record<string, unknown>; props?: Record<string, unknown>;
  }>;
  wires: Array<{ id: string; from: string; to: string; fromPort?: string; toPort?: string }>;
}): CircuitData {
  const endpoint = (componentId: string, port: string | undefined, fallback: string) =>
    componentId.includes('::') ? componentId : `${componentId}::${port ?? fallback}`;
  return {
    components: data.components.map((component) => ({
      id: component.id,
      type: component.type as CircuitData['components'][number]['type'],
      x: component.x,
      y: component.y,
      rot: component.rot ?? component.rotation ?? 0,
      props: component.props ?? component.properties ?? {},
    })),
    wires: data.wires.map((wire) => ({
      id: wire.id,
      from: endpoint(wire.from, wire.fromPort, 'pin-0'),
      to: endpoint(wire.to, wire.toPort, 'pin-1'),
    })),
  };
}

function usePlayerSocketEvents(token: string | null, setField: PlayerSetField) {
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);
  const pendingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    if (!token) return;
    const socket = getSocket(token);
    socketRef.current = socket;
    const socketEvents = createSocketEventScope(socket);
    const on = socketEvents.on;

    on('game:error', (d: { message: string }) => setField('error', d.message));
    on('game:joined', (d: { gameType: Mode; phase: string; team?: 'A' | 'B'; endsAt?: number }) => {
      setField('gameType', d.gameType);
      setField('showGuide', true);
      setField('myTeam', d.gameType === 'tug_of_war' ? d.team : undefined);
      if (SANDBOX_MODES.has(d.gameType)) {
        setField('bingoCard', null); setField('bingoCalled', []); setField('bingoLast', null);
        setField('memCards', []); setField('memRevealed', []); setField('myMatches', 0);
        setField('scWord', null); setField('scGuess', ""); setField('scSolved', 0);
        setField('qsQuestion', null); setField('qsPicked', null); setField('qsMasked', new Set());
        setField('qsAudience', null); setField('qsHint', null); setField('scores', []); setField('qsReveal', null);
        setField('circuitData', { components: [], wires: [] }); setField('challenge', null); setField('challengeCompleted', false);
        setField('refCircuit', null); setField('showRef', false);
      }
    });
    on('question:show', (d: QuestionShow) => {
      setField('question', d);
      setField('reveal', null);
      setField('myAnswer', null);
      setField('fillText', '');
      setField('iRaised', false);
      setField('pickedMe', false);
      setField('pickedName', null);
      setField('nowTick', Date.now());
    });
    on('hr:hands-update', (d: { hands: { userId: string; name: string }[]; picked: { userId: string; name: string } | null }) => {
      const me = String(useAuthStore.getState().user?.id ?? '');
      if (!d.picked) {
        setField('pickedMe', false);
        setField('pickedName', null);
        setField('iRaised', d.hands.some((h) => h.userId === me));
      }
    });
    on('hr:selected', (d: { userId: string; name: string }) => {
      setField('pickedName', d.name);
      setField('pickedMe', d.userId === String(useAuthStore.getState().user?.id ?? ''));
    });
    on('hr:you-picked', () => setField('pickedMe', true));
    on('hr:released', () => { setField('pickedMe', false); setField('pickedName', null); });
    on('cw:state', (d: { keywordRevealed: string[]; rows: { index: number; clue: string; wordLen: number; solved: boolean; word: string | null }[]; solvedCount: number; total: number }) => {
      setField('cwState', d);
    });
    on('cw:wrong', () => toast.error('Chưa đúng — giáo viên sẽ chọn người khác'));
    on('you-kicked', (d: { message?: string }) => {
      setField('joined', false);
      setField('question', null);
      setField('cwState', null);
      setField('finished', null);
      setField('error', d.message ?? 'Bạn đã bị loại khỏi phòng');
      disconnectSocket();
    });
    on('answer:reveal', (d: { correctIdx: number; correctText?: string; counts: number[]; correctCount: number; playerCount: number }) => {
      setField('reveal', d);
    });
    on('tug:update', (d: { ropePos: number }) => setField('ropePos', d.ropePos));
    on('tug:result', (d: { winnerTeam: 'A' | 'B'; teamA: number; teamB: number }) => setField('tugResult', d));
    on('math:problem', (d: { text: string; endsAt: number }) => {
      setField('mathProblem', d);
      setField('mathInput', '');
    });
    on('math:wrong', () => toast.error('Chưa đúng — thử lại!'));
    on('race:update', (d: { rows: { name: string; solved: number }[] }) => setField('raceRows', d.rows));
    on('game:finished', (d: { podium: { rank: number; name: string; score: number }[] }) => {
      setField('finished', d.podium);
      setField('question', null);
      setField('mathProblem', null);
    });

    /* ================= NEW GAMES ================= */
    const myId = () => String(useAuthStore.getState().user?.id ?? '');

    // --- Bingo ---
    on('bingo:init', (d: { players: { userId: string; name: string; card: number[][] }[] }) => {
      const mine = d.players.find((p) => p.userId === myId());
      if (!mine) return;
      setField('bingoCard', mine.card.map((row) => row.map((n) => ({ n, marked: n === 0 }))));
    });
    on('bingo:call', (d: { number: number; called: number[] }) => {
      setField('bingoCalled', d.called);
      setField('bingoLast', d.number);
    });
    on('bingo:win', (d: { userId: string; name: string }) =>
      toast.success(`🏆 ${d.name} đã BINGO!`)
    );

    // --- Memory Match ---
    on('memory:init', (d: { cards: { id: number; value: string; matched: boolean }[] }) => {
      setField('memCards', d.cards);
      setField('memRevealed', []);
    });
    on('memory:flip', (d: { userId: string; cardIndex: number; value: string }) => {
      setField('memCards', (prev) => prev.map((c) => (c.id === d.cardIndex ? { ...c, value: d.value } : c)));
      setField('memRevealed', (prev) => (prev.includes(d.cardIndex) || prev.length >= 2 ? prev : [...prev, d.cardIndex]));
    });
    on('memory:match', (d: { userId: string; cardIndices: number[] }) => {
      const matchedIds = new Set(d.cardIndices);
      if (d.userId === myId()) setField('myMatches', (m) => m + 1);
      setField('memCards', (prev) => prev.map((c) => (matchedIds.has(c.id) ? { ...c, matched: true } : c)));
      setField('memRevealed', []);
      toast.success(`✅ ${d.userId === myId() ? 'Bạn' : 'Ai đó'} tìm ra 1 cặp!`);
    });
    on('memory:hide', (d: { cardIndices: number[] }) => {
      const hiddenIds = new Set(d.cardIndices);
      const timer = setTimeout(() => {
        pendingTimersRef.current.delete(timer);
        setField('memRevealed', (prev) => prev.filter((i) => !hiddenIds.has(i)));
      }, 900);
      pendingTimersRef.current.add(timer);
    });

    // --- Word Scramble ---
    on('word_scramble:next', (d: { word: string; index: number; total: number }) => {
      setField('scWord', d); setField('scGuess', '');
    });
    on('word_scramble:update', (d: { players: { userId: string; name: string; solved: number }[] }) => {
      const mine = d.players.find((p) => p.userId === myId());
      if (mine) setField('scSolved', mine.solved);
    });
    on('word_scramble:correct', (d: { userId: string; points: number }) => {
      toast.success(`${d.userId === myId() ? 'Chính xác!' : 'Ai đó vừa giải xong'} (+${d.points}đ)`);
    });
    on('word_scramble:wrong', (d: { userId: string }) => {
      if (d.userId === myId()) toast.error('Chưa đúng — thử lại!');
    });

    // --- Quiz Show ---
    on('quiz_show:question', (d: { index: number; total: number; question: { id: string; type: string; content: string; options: string[] } }) => {
      setField('qsQuestion', { ...d.question, index: d.index, total: d.total });
      setField('qsPicked', null); setField('qsMasked', new Set()); setField('qsAudience', null); setField('qsHint', null);
    });
    on('quiz_show:reveal', (d: { correctIdx: number; correctText?: string; scores: { userId: string; name: string; score: number; streak: number }[] }) => {
      setField('qsReveal', { correctIdx: d.correctIdx, correctText: d.correctText });
      setField('scores', d.scores.map((s) => ({ name: s.name, score: s.score, streak: s.streak })));
    });
    on('quiz_show:fifty_fifty', (d: { userId: string; remaining: string[] }) => {
      if (d.userId !== myId()) return;
      setField('qsMasked', new Set(d.remaining.flatMap((value, index) => value === '' ? [index] : [])));
      toast.info('50:50 — hai đáp án sai đã bị loại');
    });
    on('quiz_show:ask_audience', (d: { userId: string; percentages: number[] }) => {
      if (d.userId === myId()) { setField('qsAudience', d.percentages); toast.info('Khán giả bình chọn…'); }
    });
    on('quiz_show:phone_friend', (d: { userId: string; hint: string }) => {
      if (d.userId === myId()) { setField('qsHint', d.hint); toast.info('📞 Người thân gợi ý…'); }
    });

    // --- Circuit ---
    on('circuit_draw:init', (d: { referenceCircuit: CircuitData | null }) => {
      setField('circuitData', { components: [], wires: [] });
      setField('refCircuit', d?.referenceCircuit ?? null);
      setField('showRef', false);
    });
    on('circuit_simulate:challenge', (d: {
      index: number;
      total: number;
      paused: boolean;
      remainingMs: number;
      challenge: { title: string; description: string; targetBehavior: string; starterCircuit?: CircuitData | null };
    }) => {
      setField('challenge', {
        ...d.challenge,
        index: d.index,
        total: d.total,
        paused: d.paused,
        remainingMs: d.remainingMs,
      });
      setField('circuitData', d.challenge.starterCircuit ? { components: d.challenge.starterCircuit.components, wires: d.challenge.starterCircuit.wires } : { components: [], wires: [] });
      setField('challengeCompleted', false);
    });
    on('circuit_simulate:control_state', (d: { index: number; paused: boolean; remainingMs: number }) => {
      setField('challenge', (current) => current && current.index === d.index
        ? { ...current, paused: d.paused, remainingMs: d.remainingMs }
        : current);
    });
    on('circuit_simulate:challenge_passed', (d: { userId: string; name: string; points: number }) => {
      if (d.userId === myId()) setField('challengeCompleted', true);
      toast.success(`🎯 ${d.userId === myId() ? 'Bạn đã' : d.name + ' đã'} vượt qua thử thách (+${d.points}đ)`);
    });
    on('circuit_simulate:restored', (d: {
      circuit: Parameters<typeof deserializeCircuitFromRoom>[0] | null;
      completed: boolean;
    }) => {
      if (d.circuit) setField('circuitData', deserializeCircuitFromRoom(d.circuit));
      setField('challengeCompleted', d.completed);
    });
    on('circuit_simulate:validation', (d: { correct: boolean; feedback: string }) => {
      if (!d.correct) toast.error(d.feedback);
    });
    on('circuit_draw:verified', (d: { userId: string; correct: boolean; feedback?: string; newKttx: number | null }) => {
      if (d.userId !== myId()) return;
      if (d.correct) {
        toast.success(`🎉 Mạch được chấp nhận!${d.newKttx != null ? ` KTTX hiện tại: ${d.newKttx}` : ''}`);
      } else {
        toast.error(d.feedback || 'Mạch chưa khớp mạch mẫu — hãy chỉnh sửa và nộp lại');
      }
    });

    return () => {
      for (const timer of pendingTimersRef.current) clearTimeout(timer);
      pendingTimersRef.current.clear();
      socketEvents.dispose();
      socket.disconnect();
    };
  }, [token, setField]);

  return socketRef;
}

export default function GamePlayPage() {
  const [searchParams] = useSearchParams();
  const token = useAuthStore((s) => s.token);
  const initialRoom = (searchParams.get('room') ?? '').replace(/\D/g, '').slice(0, 6);
  const [state, setField] = useFieldReducer(() => createPlayerGameState(initialRoom));
  const {
    roomInput, showGuide, joined, gameType, myTeam, question, reveal, ropePos,
    mathProblem, mathInput, myAnswer, finished, error, nowTick,
    pickedMe, cwState, cwRow, cwWord, bingoCard, bingoCalled,
    memCards, memRevealed, scWord, scGuess, qsQuestion, qsReveal, qsPicked, qsLifelines,
  } = state;
  const autoJoinAttemptedRef = useRef(false);
  const bingoCalledSet = useMemo(() => new Set(bingoCalled), [bingoCalled]);
  const memRevealedSet = useMemo(() => new Set(memRevealed), [memRevealed]);
  const socketRef = usePlayerSocketEvents(token, setField);

  useEffect(() => {
    const t = setInterval(() => setField('nowTick', Date.now()), 250);
    return () => clearInterval(t);
  }, [setField]);

  const join = useCallback((code?: string) => {
    const target = (code ?? roomInput).trim();
    if (!/^\d{6}$/.test(target)) {
      toast.error('Mã phòng gồm 6 chữ số');
      return;
    }
    socketRef.current?.emit('game:join', { roomCode: target });
    setField('joined', true);
    setField('error', '');
  }, [roomInput, setField, socketRef]);

  useEffect(() => {
    if (!token || joined || autoJoinAttemptedRef.current) return;
    const urlRoom = (searchParams.get('room') ?? '').replace(/\D/g, '').slice(0, 6);
    if (/^\d{6}$/.test(urlRoom)) {
      autoJoinAttemptedRef.current = true;
      const t = setTimeout(() => join(urlRoom), 400);
      return () => clearTimeout(t);
    }
  }, [token, joined, searchParams, join]);

  function answer(choiceIdx: number, text?: string) {
    if (!question || myAnswer !== null || reveal) return;
    setField('myAnswer', text ? -1 : choiceIdx);
    const msTaken = Date.now() - (question.endsAt - question.durationSec * 1000);
    socketRef.current?.emit('game:answer', { choiceIdx, text, msTaken });
  }

  function submitMath() {
    if (!mathProblem || mathInput.trim() === '') return;
    socketRef.current?.emit('math:answer', { answer: mathInput.trim() });
    setField('mathSolved', (s) => s + 1);
  }

  function raiseHand() {
    if (pickedMe) return;
    socketRef.current?.emit('hr:hand');
  }

  function cwSubmit() {
    if (!pickedMe || !cwState) return;
    const row = cwState.rows[cwRow];
    if (!row || row.solved || !cwWord.trim()) return;
    socketRef.current?.emit('cw:try', { rowIndex: row.index, word: cwWord.trim() });
    setField('cwWord', '');
    setField('cwRow', (r) => {
      const nextUnsolved = cwState.rows.findIndex((x) => !x.solved && x.index !== row.index);
      return nextUnsolved >= 0 ? nextUnsolved : r;
    });
  }

  /* ===== new game actions ===== */
  function bingoToggle(rowIdx: number, colIdx: number, n: number) {
    if (!bingoCard || n === 0 || !bingoCalledSet.has(n)) return;
    setField('bingoCard', (prev) =>
      prev ? prev.map((row, ri) => row.map((c, ci) => (ri === rowIdx && ci === colIdx ? { ...c, marked: !c.marked } : c))) : prev
    );
    socketRef.current?.emit('bingo:mark', { number: n });
  }

  function memFlip(cardId: number) {
    const card = memCards.find((c) => c.id === cardId);
    if (!card || card.matched || memRevealedSet.has(cardId) || memRevealed.length >= 2) return;
    socketRef.current?.emit('memory:flip', { cardIndex: cardId });
  }

  function scSubmit() {
    if (!scWord || !scGuess.trim()) return;
    socketRef.current?.emit('word_scramble:guess', { word: scGuess.trim() });
    setField('scGuess', '');
  }

  function qsAnswer(idx: number) {
    if (!qsQuestion || qsPicked !== null || qsReveal) return;
    setField('qsPicked', idx);
    socketRef.current?.emit('quiz_show:answer', { choiceIdx: idx });
  }

  function qsUseLifeline(kind: 'fiftyFifty' | 'askAudience' | 'phoneFriend') {
    if (!qsLifelines[kind]) return;
    setField('qsLifelines', (l) => ({ ...l, [kind]: false }));
    socketRef.current?.emit('quiz_show:answer', { choiceIdx: -1, lifeline: kind });
  }

  function syncCircuit(data: CircuitData) {
    setField('circuitData', data);
    if (gameType === 'circuit_simulate') socketRef.current?.emit('circuit_simulate:circuit', serializeCircuitForRoom(data));
  }

  function submitCircuit(data: CircuitData) {
    syncCircuit(data);
    if (gameType === 'circuit_simulate') {
      socketRef.current?.emit('circuit_simulate:circuit', { ...serializeCircuitForRoom(data), submitted: true });
      toast.success('Đã gửi mạch để hệ thống chấm thử thách');
      return;
    }
    socketRef.current?.emit('circuit_draw:submit', serializeCircuitForRoom(data));
    toast.success('Đã nộp mạch cho giáo viên');
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const secondsLeft = question ? Math.max(0, Math.ceil((question.endsAt - nowTick) / 1000)) : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Tham gia trò chơi" subtitle="Nhập mã phòng giáo viên đang chiếu" actions={
        joined ? <Button variant="secondary" onClick={() => setField('showGuide', true)}><i className="fas fa-circle-play" /> Cách chơi</Button> : undefined
      } />

      {!joined && (
        <Card className="p-6 text-center">
          <Input
            value={roomInput}
            onChange={(e) => setField('roomInput', e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Mã phòng 6 số"
            className="mx-auto mt-2 !w-48 text-center !text-3xl font-bold tracking-[0.3em]"
          />
          <Button className="mt-4 w-full" onClick={() => join()}>Vào phòng</Button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </Card>
      )}

      {joined && finished && <FinishedPlayerView state={state} />}

      {joined && !finished && gameType === 'hand_raise' && question && (
        <HandRaisePlayerView state={state} onRaiseHand={raiseHand} />
      )}

      {joined && !finished && gameType === 'crossword' && cwState && (
        <CrosswordPlayerView
          state={state}
          onRaiseHand={raiseHand}
          onRowChange={(row) => setField('cwRow', row)}
          onWordChange={(word) => setField('cwWord', word)}
          onSubmit={cwSubmit}
        />
      )}

      {joined && !finished && gameType === 'math_race' && (
        <MathRacePlayerView
          state={state}
          onInputChange={(value) => setField('mathInput', value)}
          onSubmit={submitMath}
        />
      )}

      {joined && !finished && gameType === 'bingo' && (
        <BingoPlayerView state={state} calledSet={bingoCalledSet} onToggle={bingoToggle} />
      )}

      {joined && !finished && gameType === 'memory_match' && (
        <MemoryPlayerView state={state} revealedSet={memRevealedSet} onFlip={memFlip} />
      )}

      {joined && !finished && gameType === 'word_scramble' && (
        <WordScramblePlayerView state={state} onGuessChange={(value) => setField('scGuess', value)} onSubmit={scSubmit} />
      )}

      {/* ===== CHIẾC NÓN KỲ DỆU ===== */}
      {joined && !finished && gameType === 'quiz_show' && (
        <QuizShowPlayerView state={state} onAnswer={qsAnswer} onUseLifeline={qsUseLifeline} />
      )}

      {/* ===== MẠCH ĐIỆN ===== */}
      {joined && !finished && (gameType === 'circuit_draw' || gameType === 'circuit_simulate') && (
        <CircuitPlayerView
          state={state}
          onCircuitChange={syncCircuit}
          onSubmit={submitCircuit}
          onToggleReference={() => setField('showRef', (visible) => !visible)}
        />
      )}

      {/* ===== QUIZ / KÉO CO / ĐIỀN CHỖ TRỐNG ===== */}
      {joined && !finished && gameType === 'tug_of_war' && (
        <TugOfWarPlayerView team={myTeam} ropePosition={ropePos} />
      )}

      {joined && !finished && (gameType === 'quick_quiz' || gameType === 'tug_of_war') && question && (
        <StandardQuestionPlayerView
          state={state}
          secondsLeft={secondsLeft}
          onAnswer={answer}
          onFillChange={(value) => setField('fillText', value)}
        />
      )}

      {joined && !finished && !SANDBOX_MODES.has(gameType) && gameType !== 'math_race' && !question && (
        <WaitingPlayerView roomCode={roomInput} team={myTeam} />
      )}

      {joined && showGuide && <StudentGuideModal mode={gameType} onClose={() => setField('showGuide', false)} />}
    </div>
  );
}

function StudentGuideModal({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const guide = studentGuideFor(mode);
  return (
    <Modal open onClose={onClose} title={`Cách chơi — ${guide.title}`} wide>
      <img src={guide.gif} alt={`Minh họa cách chơi ${guide.title}`} className="aspect-video w-full rounded-sm border border-slate-200 bg-slate-100 object-cover" />
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
        {guide.rules.map((rule) => <li key={rule}>{rule}</li>)}
      </ol>
      <div className="mt-4 flex justify-end"><Button onClick={onClose}>Đã hiểu</Button></div>
    </Modal>
  );
}

function FinishedPlayerView({ state }: { state: PlayerGameState }) {
  const { finished, tugResult, gameType } = state;
  if (!finished) return null;
  return (
    <Card className="p-6 text-center">
      {tugResult && (
        <p className={`mb-3 text-xl font-bold ${tugResult.winnerTeam === 'A' ? 'text-blue-700' : 'text-red-600'}`}>
          <i className="fas fa-trophy text-amber-500" /> Đội {tugResult.winnerTeam} kéo thắng! ({tugResult.teamA}đ – {tugResult.teamB}đ)
        </p>
      )}
      <h3 className="text-xl font-bold text-slate-800">Kết quả</h3>
      <ol className="mt-4 space-y-1.5 text-left">
        {finished.map((result) => (
          <li key={result.rank} className={`flex justify-between rounded-sm border px-4 py-2 ${result.rank === 1 ? 'border-amber-200 bg-gradient-to-r from-amber-100 to-transparent text-lg font-bold' : 'border-slate-200 bg-slate-50'}`}>
            <span>{result.rank === 1 ? <i className="fas fa-medal text-yellow-500" /> : result.rank === 2 ? <i className="fas fa-medal text-slate-400" /> : result.rank === 3 ? <i className="fas fa-medal text-amber-600" /> : `${result.rank}.`} {result.name}</span>
            <b>{result.score}{gameType === 'math_race' ? ' bài' : ' đ'}</b>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function HandRaisePlayerView({ state, onRaiseHand }: { state: PlayerGameState; onRaiseHand: () => void }) {
  const { pickedMe, pickedName, question, iRaised } = state;
  if (!question) return null;
  return (
    <>
      {pickedMe && <div className="mb-4 animate-pulse rounded-sm bg-gradient-to-r from-blue-900 to-blue-700 p-5 text-center text-xl font-bold text-white shadow-lg"><i className="fas fa-bullseye" /> Giáo viên chọn BẠN trả lời! Hãy đứng lên nói câu trả lời…</div>}
      {!pickedMe && pickedName && <p className="mb-3 rounded-sm border border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-sm text-slate-500"><i className="fas fa-hand-point-up" /> {pickedName} đang trả lời…</p>}
      <Card className="p-6">
        <p className="mb-1 text-xs text-slate-500">Câu {question.index + 1}/{question.total}</p>
        <p className="whitespace-pre-wrap leading-relaxed">{question.question.content}</p>
      </Card>
      {!pickedMe && !pickedName && (
        <Button className={`mt-5 w-full !py-5 !text-xl ${iRaised ? '!bg-emerald-600' : ''}`} onClick={onRaiseHand}>
          {iRaised ? <><i className="fas fa-hand" /> Đã giơ tay — chờ giáo viên…</> : <><i className="fas fa-hand" /> GIƠ TAY TRẢ LỜI</>}
        </Button>
      )}
    </>
  );
}

function CrosswordPlayerView({
  state,
  onRaiseHand,
  onRowChange,
  onWordChange,
  onSubmit,
}: {
  state: PlayerGameState;
  onRaiseHand: () => void;
  onRowChange: (row: number) => void;
  onWordChange: (word: string) => void;
  onSubmit: () => void;
}) {
  const { pickedMe, pickedName, cwState, cwRow, cwWord } = state;
  if (!cwState) return null;
  return (
    <>
      {pickedMe ? (
        <Card className="mb-4 p-5 ring-2 ring-blue-400">
          <h3 className="mb-3 font-semibold text-blue-700"><i className="fas fa-bullseye" /> Bạn được chọn! Chọn hàng và nhập đáp án:</h3>
          <div className="space-y-3">
            <Select value={cwRow} onChange={(event) => onRowChange(Number(event.target.value))}>
              {cwState.rows.flatMap((row) => row.solved ? [] : [<option key={row.index} value={row.index}>Hàng {row.index + 1}: {row.clue}</option>])}
            </Select>
            <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="flex gap-2">
              <Input autoFocus value={cwWord} onChange={(event) => onWordChange(event.target.value)} placeholder="Từ khóa hàng ngang…" className="!py-3" />
              <Button type="submit" disabled={!cwWord.trim()}>Gửi</Button>
            </form>
          </div>
        </Card>
      ) : pickedName ? (
        <p className="mb-4 rounded-sm border border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-sm text-slate-500"><i className="fas fa-hand-point-up" /> {pickedName} đang giải…</p>
      ) : (
        <Button className="mb-4 w-full !py-4" onClick={onRaiseHand}><i className="fas fa-hand" /> GIƠ TAY — Xin trả lời ô chữ</Button>
      )}
      <Card className="p-5">
        <div className="mb-4 flex justify-center gap-1.5">
          {cwState.rows.map((row) => {
            const character = cwState.keywordRevealed[row.index] ?? '_';
            return <span key={`keyword-${row.index}`} className={`flex h-9 w-9 items-center justify-center rounded-sm text-lg font-extrabold ${character !== '_' ? 'bg-blue-900 text-white' : 'bg-slate-200 text-slate-400'}`}>{character}</span>;
          })}
        </div>
        <ul className="space-y-2">
          {cwState.rows.map((row, index) => (
            <li key={row.index} className={`flex items-center gap-3 rounded-sm border px-3 py-2.5 text-sm ${row.solved ? 'border-emerald-200 bg-emerald-50' : index === cwRow && pickedMe ? 'border-2 border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
              <span className="font-mono font-bold text-blue-700">{row.index + 1}</span>
              <span className="min-w-0 flex-1">{row.solved ? <b className="tracking-wide text-emerald-700">{row.word}</b> : row.clue}</span>
              {!row.solved && <span className="text-xs text-slate-400">{row.wordLen} chữ</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-center text-xs text-slate-500">Đã giải {cwState.solvedCount}/{cwState.total} hàng</p>
      </Card>
    </>
  );
}

function MathRacePlayerView({ state, onInputChange, onSubmit }: { state: PlayerGameState; onInputChange: (value: string) => void; onSubmit: () => void }) {
  const { mathProblem, mathSolved, mathInput, raceRows } = state;
  return (
    <Card className="p-6 text-center">
      {mathProblem ? (
        <>
          <p className="text-xs uppercase tracking-wide text-slate-500">Giải nhanh — đã giải {mathSolved} bài</p>
          <p className="my-6 text-5xl font-extrabold tracking-wide text-blue-900">{mathProblem.text} = ?</p>
          <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="flex gap-2">
            <Input autoFocus inputMode="numeric" value={mathInput} onChange={(event) => onInputChange(event.target.value)} placeholder="Đáp án…" className="!py-3 text-center !text-xl" />
            <Button type="submit" className="!px-6">Gửi</Button>
          </form>
        </>
      ) : <p className="animate-pulse py-8"><i className="fas fa-hourglass-half" /> Chờ giáo viên bắt đầu đua…</p>}
      {raceRows.length > 0 && (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <h4 className="mb-2 text-sm font-medium text-slate-500">Bảng đua</h4>
          <ol className="space-y-1 text-left text-sm">
            {raceRows.slice(0, 10).map((result, index) => <li key={result.name} className="flex justify-between rounded-sm border border-slate-200 bg-slate-50 px-3 py-1.5"><span>{index + 1}. {result.name}</span><b>{result.solved}</b></li>)}
          </ol>
        </div>
      )}
    </Card>
  );
}

function TugOfWarPlayerView({ team, ropePosition }: { team: 'A' | 'B' | undefined; ropePosition: number }) {
  return (
    <>
      {team && <div className={`mb-3 rounded-sm border px-4 py-2 text-center text-sm font-semibold ${team === 'A' ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-red-200 bg-red-50 text-red-700'}`}>Bạn thuộc <i className="fas fa-flag" /> {team === 'A' ? 'ĐỘI A (xanh)' : 'ĐỘI B (đỏ)'}</div>}
      <Card className="mb-4 p-4">
        <div className="relative h-7 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          <div className="absolute left-1/2 top-0 h-full w-px bg-slate-300" />
          <div className="absolute top-0.5 flex h-6 w-9 items-center justify-center rounded-full bg-amber-500 text-white transition-[left] duration-700" style={{ left: `calc(${50 + Math.max(-48, Math.min(48, ropePosition * 0.48))}% - 18px)` }}><i className="fas fa-people-pulling text-xs" /></div>
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-slate-500"><span>◀ ĐỘI A THẮNG</span><span>ĐỘI B THẮNG ▶</span></div>
      </Card>
    </>
  );
}

function StandardQuestionPlayerView({ state, secondsLeft, onAnswer, onFillChange }: { state: PlayerGameState; secondsLeft: number; onAnswer: (choiceIndex: number, text?: string) => void; onFillChange: (value: string) => void }) {
  const { question, myAnswer, reveal, fillText } = state;
  if (!question) return null;
  const disabled = myAnswer !== null || !!reveal || secondsLeft === 0;
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-slate-500">Câu {question.index + 1}/{question.total}</span>
        <span className={`rounded-sm border px-3 py-1 font-mono text-xl font-bold ${secondsLeft <= 5 ? 'border-red-200 bg-red-50 text-red-600' : 'border-slate-200 bg-slate-100 text-emerald-700'}`}>{secondsLeft}s</span>
      </div>
      <Card className="p-5"><p className="whitespace-pre-wrap leading-relaxed">{question.question.content}</p></Card>
      {question.question.type === 'mcq' ? (
        <div className={`mt-4 grid gap-2 ${question.question.options.length > 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {question.question.options.map((option, index) => {
            const letter = String.fromCharCode(65 + index);
            return <button key={letter} onClick={() => onAnswer(index)} disabled={disabled} className={`rounded-sm border px-4 py-4 text-left text-sm transition disabled:opacity-80 ${reveal ? index === reveal.correctIdx ? 'border-emerald-400 bg-emerald-100 text-emerald-900 ring-2 ring-emerald-400' : myAnswer === index ? 'border-red-300 bg-red-100 text-red-800' : 'border-slate-200 bg-slate-100 text-slate-400' : myAnswer === index ? 'border-blue-900 bg-blue-900 text-white ring-2 ring-blue-300' : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-md active:scale-[0.98]'}`}><b className="mr-2">{letter}.</b>{option.replace(/^([A-D])[\.\:\)]\s+/, '')}</button>;
          })}
        </div>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); if (fillText.trim()) onAnswer(-1, fillText.trim()); }} className="mt-4 flex gap-2">
          <Input autoFocus value={fillText} onChange={(event) => onFillChange(event.target.value)} placeholder="Nhập đáp án điền vào chỗ trống…" disabled={disabled} className="!py-3" />
          <Button type="submit" disabled={disabled || !fillText.trim()}>Gửi</Button>
        </form>
      )}
      {reveal && question.question.type === 'fill' && <p className="mt-3 text-center text-sm text-emerald-600"><i className="fas fa-check" /> Đáp án đúng: <b>{reveal.correctText}</b> ({reveal.correctCount}/{reveal.playerCount} đúng)</p>}
      {myAnswer !== null && !reveal && <p className="mt-3 animate-pulse text-center text-sm text-blue-700">Đã gửi {question.question.type === 'mcq' ? 'đáp án ' : ''}— chờ kết quả…</p>}
    </>
  );
}

function WaitingPlayerView({ roomCode, team }: { roomCode: string; team: 'A' | 'B' | undefined }) {
  return (
    <Card className="p-8 text-center">
      <p className="animate-pulse text-lg"><i className="fas fa-hourglass-half" /> Đang chờ giáo viên bắt đầu…</p>
      <p className="mt-2 text-xs text-slate-500">Phòng {roomCode} · đã vào thành công{team ? ` · đội ${team}` : ''}</p>
    </Card>
  );
}

function QuizShowPlayerView({
  state,
  onAnswer,
  onUseLifeline,
}: {
  state: PlayerGameState;
  onAnswer: (choiceIndex: number) => void;
  onUseLifeline: (kind: 'fiftyFifty' | 'askAudience' | 'phoneFriend') => void;
}) {
  const { qsQuestion, qsReveal, qsPicked, qsMasked, qsAudience, qsHint, qsLifelines, scores } = state;
  return (
    <>
      {qsQuestion ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-sm text-slate-500">Câu {qsQuestion.index + 1}/{qsQuestion.total}</span>
            <div className="flex gap-1.5">
              {([['fiftyFifty', '50:50', 'fa-divide'], ['askAudience', 'Khán giả', 'fa-users'], ['phoneFriend', 'Gọi điện', 'fa-phone']] as const).map(([kind, label, icon]) => (
                <button
                  key={kind}
                  onClick={() => onUseLifeline(kind)}
                  disabled={!qsLifelines[kind] || !!qsReveal || qsPicked !== null}
                  className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
                    qsLifelines[kind]
                      ? 'border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100 active:scale-95'
                      : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-300 line-through'
                  }`}
                >
                  <i className={`fas ${icon}`} /> {label}
                </button>
              ))}
            </div>
          </div>
          <Card className="p-5"><p className="whitespace-pre-wrap leading-relaxed">{qsQuestion.content}</p></Card>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {qsQuestion.options.map((option, index) => {
              const letter = String.fromCharCode(65 + index);
              const masked = qsMasked.has(index);
              if (masked && !qsReveal) return <div key={letter} className="rounded-sm border border-dashed border-slate-200 bg-slate-50" />;
              const isCorrect = qsReveal && index === qsReveal.correctIdx;
              const isWrongPick = qsReveal && qsPicked === index && !isCorrect;
              return (
                <button
                  key={letter}
                  onClick={() => onAnswer(index)}
                  disabled={masked || qsPicked !== null || !!qsReveal}
                  className={`relative overflow-hidden rounded-sm border px-4 py-4 text-left text-sm transition disabled:opacity-90 ${
                    qsReveal
                      ? isCorrect
                        ? 'border-emerald-400 bg-emerald-100 font-bold text-emerald-900 ring-2 ring-emerald-400'
                        : isWrongPick
                          ? 'border-red-300 bg-red-100 text-red-800'
                          : 'border-slate-200 bg-slate-100 text-slate-400'
                      : masked
                        ? 'border-slate-200 bg-slate-100 text-slate-300 line-through'
                        : qsPicked === index
                          ? 'border-blue-900 bg-blue-900 text-white ring-2 ring-blue-300'
                          : 'border-slate-200 bg-white hover:border-purple-300 hover:shadow-md active:scale-[0.98]'
                  }`}
                >
                  {qsAudience && <span className="absolute inset-y-0 left-0 bg-purple-200/60 transition-[width] duration-700" style={{ width: `${Math.min(100, qsAudience[index] ?? 0)}%` }} />}
                  <span className="relative">
                    <b className="mr-2">{letter}.</b>{option.replace(/^([A-D])[\.\:\)]\s+/, '')}
                    {qsAudience && <span className="ml-2 text-xs font-mono opacity-70">{qsAudience[index] ?? 0}%</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {qsHint && <p className="mt-3 animate-bounce rounded-sm border border-purple-200 bg-purple-50 px-4 py-2.5 text-center text-sm text-purple-800">📞 <i>Người thân:</i> “{qsHint}”</p>}
          {qsPicked !== null && !qsReveal && <p className="mt-3 animate-pulse text-center text-sm text-blue-700">Đã khoá đáp án — chờ giáo viên…</p>}
        </>
      ) : (
        <p className="animate-pulse py-8 text-center"><i className="fas fa-hourglass-half" /> Chờ câu hỏi mở màn…</p>
      )}
      {scores.length > 0 && <QuickScoreboard scores={scores} />}
    </>
  );
}

function QuickScoreboard({ scores }: { scores: PlayerGameState['scores'] }) {
  return (
    <Card className="mt-4 p-4">
      <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Bảng điểm nhanh</h4>
      <ol className="space-y-1 text-sm">
        {scores.toSorted((left, right) => right.score - left.score).slice(0, 8).map((score, index) => (
          <li key={score.name} className="flex items-center justify-between rounded-sm border border-slate-200 bg-slate-50 px-3 py-1.5">
            <span>{index + 1}. {score.name}{score.streak >= 3 && <span className="ml-2 text-xs text-orange-600">🔥 {score.streak} liên tiếp</span>}</span>
            <b>{score.score} đ</b>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function CircuitPlayerView({
  state,
  onCircuitChange,
  onSubmit,
  onToggleReference,
}: {
  state: PlayerGameState;
  onCircuitChange: (data: CircuitData) => void;
  onSubmit: (data: CircuitData) => void;
  onToggleReference: () => void;
}) {
  const { gameType, challenge, challengeCompleted, refCircuit, showRef, circuitData } = state;
  const circuitMode = gameType === 'circuit_draw' ? 'circuit_draw' : 'circuit_simulate';
  return (
    <>
      {challenge && (
        <Card className="mb-3 border-l-4 border-l-blue-600 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Thử thách {challenge.index + 1}/{challenge.total}</p>
          <h3 className="mt-0.5 font-bold text-slate-800">{challenge.title}</h3>
          <p className="text-sm text-slate-600">{challenge.description}</p>
          <p className="mt-1 text-xs italic text-emerald-700"><i className="fas fa-bullseye" /> Mục tiêu: {challenge.targetBehavior}</p>
          {challenge.paused && (
            <p className="mt-2 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800" role="status">
              <i className="fas fa-circle-pause" /> Giáo viên đang tạm dừng · còn {Math.ceil(challenge.remainingMs / 1000)} giây
            </p>
          )}
          {challengeCompleted && (
            <p className="mt-2 rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              <i className="fas fa-circle-check" /> Bạn đã hoàn thành thử thách này — trạng thái được giữ khi kết nối lại.
            </p>
          )}
        </Card>
      )}
      {gameType === 'circuit_draw' && refCircuit && refCircuit.components.length > 0 && (
        <div className="mb-2">
          <button onClick={onToggleReference} className="flex w-full items-center justify-between rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100">
            <span><i className="fas fa-clipboard-list" /> MẠCH MẪU GV YÊU CẦU — {refCircuit.components.length} linh kiện {showRef ? '▾' : '▸'}</span>
          </button>
          {showRef && <div className="mt-1.5 h-[300px] overflow-hidden rounded-sm border border-slate-200 bg-white"><CircuitCanvas gameType="circuit_draw" initialData={refCircuit} onChange={() => undefined} /></div>}
        </div>
      )}
      {gameType === 'circuit_draw' && (
        <p className="mb-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <i className="fas fa-circle-info" /> Chọn linh kiện ở bảng trái, nối dây từ chân OUT (xanh dương) sang chân IN (đỏ). Dây xanh lá = mức HIGH khi chạy mô phỏng. Xong bấm <b>Nộp mạch</b> — GV chấm và cộng KTTX.
        </p>
      )}
      <div className="h-[540px] overflow-hidden rounded-sm border border-slate-200">
        <CircuitCanvas gameType={circuitMode} initialData={circuitData} onChange={onCircuitChange} onSubmitCircuit={onSubmit} />
      </div>
    </>
  );
}

function BingoPlayerView({
  state,
  calledSet,
  onToggle,
}: {
  state: PlayerGameState;
  calledSet: Set<number>;
  onToggle: (row: number, column: number, value: number) => void;
}) {
  const { bingoCard, bingoCalled, bingoLast } = state;
  return (
    <Card className="p-5">
      {bingoCard ? (
        <>
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-amber-400 bg-amber-50 text-3xl font-black text-amber-700 shadow-inner">
              {bingoLast ?? '—'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Số vừa gọi — đã gọi {bingoCalled.length} số</p>
              <p className="mt-1 truncate font-mono text-sm text-slate-700">{bingoCalled.slice(-14).join(' · ')}</p>
              <p className="mt-0.5 text-[10px] text-slate-400">Bấm ô để đánh dấu (ô vàng = vừa được gọi)</p>
            </div>
          </div>
          <div className="mx-auto w-fit">
            <div className="grid grid-cols-5 gap-1.5">
              {['B', 'I', 'N', 'G', 'O'].map((heading) => (
                <span key={heading} className="pb-1 text-center text-sm font-black text-blue-900">{heading}</span>
              ))}
              {bingoCard.flatMap((row, rowIndex) => row.map((cell, columnIndex) => {
                const callable = cell.n === 0 || calledSet.has(cell.n);
                return (
                  <button
                    key={`${rowIndex}-${columnIndex}`}
                    onClick={() => onToggle(rowIndex, columnIndex, cell.n)}
                    disabled={!callable}
                    className={`h-11 w-11 rounded-sm border text-lg font-bold transition active:scale-95 ${
                      cell.marked
                        ? 'border-emerald-500 bg-emerald-500 text-white shadow-md'
                        : callable
                          ? 'animate-pulse border-amber-400 bg-amber-50 text-slate-800 hover:bg-amber-100'
                          : 'border-slate-200 bg-slate-100 text-slate-300'
                    }`}
                  >
                    {cell.n === 0 ? '★' : cell.n}
                  </button>
                );
              }))}
            </div>
          </div>
        </>
      ) : (
        <p className="animate-pulse py-8 text-center"><i className="fas fa-hourglass-half" /> Chờ giáo viên phát phiếu Bingo…</p>
      )}
    </Card>
  );
}

function MemoryPlayerView({
  state,
  revealedSet,
  onFlip,
}: {
  state: PlayerGameState;
  revealedSet: Set<number>;
  onFlip: (cardId: number) => void;
}) {
  const { memCards, myMatches } = state;
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-600"><i className="fas fa-clone text-blue-700" /> Bạn đã ghép <b className="text-emerald-600">{myMatches}</b> cặp</span>
        <span className="text-xs text-slate-400">Lật 2 thẻ — giống nhau giữ mở, khác úp lại</span>
      </div>
      {memCards.length > 0 ? (
        <div className="grid grid-cols-6 gap-2">
          {memCards.map((card) => {
            const open = card.matched || revealedSet.has(card.id);
            return (
              <button
                key={card.id}
                onClick={() => onFlip(card.id)}
                disabled={card.matched}
                className={`flex aspect-square items-center justify-center rounded-sm border text-xl font-black transition-all duration-200 ${
                  card.matched
                    ? 'border-emerald-400 bg-emerald-100 text-emerald-700'
                    : open
                      ? 'scale-105 border-blue-400 bg-blue-50 text-blue-900 ring-2 ring-blue-300'
                      : 'border-slate-600 bg-gradient-to-br from-slate-700 to-slate-900 text-transparent hover:brightness-125'
                }`}
              >
                {open ? card.value : '?'}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="animate-pulse py-8 text-center"><i className="fas fa-hourglass-half" /> Chờ giáo viên úp thẻ lên bàn…</p>
      )}
    </Card>
  );
}

function WordScramblePlayerView({
  state,
  onGuessChange,
  onSubmit,
}: {
  state: PlayerGameState;
  onGuessChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const { scSolved, scWord, scGuess } = state;
  return (
    <Card className="p-6 text-center">
      <p className="text-xs uppercase tracking-wide text-slate-500">Bạn đã giải <b className="text-emerald-600">{scSolved}</b>{scWord ? `/${scWord.total}` : ''} từ — càng ít lần thử điểm càng cao</p>
      {scWord ? (
        <>
          <p className="my-7 select-none break-all text-4xl font-black tracking-[0.3em] text-blue-900">{scWord.word.toUpperCase()}</p>
          <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="flex gap-2">
            <Input
              autoFocus
              value={scGuess}
              onChange={(event) => onGuessChange(event.target.value)}
              placeholder="Nhập từ đúng…"
              className="!py-3 text-center !text-lg"
            />
            <Button type="submit" className="!px-6" disabled={!scGuess.trim()}>Gửi</Button>
          </form>
        </>
      ) : (
        <p className="animate-pulse py-8"><i className="fas fa-hourglass-half" /> Chờ từ đầu tiên…</p>
      )}
    </Card>
  );
}

