import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { JWT_SECRET } from '../config.js';
import { db, queryAll, tx, getUserById, toPublicUser } from '../db/connection.js';

const zRoom = z.object({ roomCode: z.string().length(6) });
const zAnswer = z.object({ choiceIdx: z.number().int().min(-1).max(9).default(-1), text: z.string().max(500).optional() });
const zMathAnswer = z.object({ answer: z.union([z.string().max(50), z.number()]) });

interface GameQuestion {
  id: string;
  type: 'mcq' | 'fill';
  content: string;
  options?: string[];
  correctIdx?: number;
  correctText?: string;
}

interface PlayerInfo {
  userId: string;
  displayName: string;
  score: number;
  team?: 'A' | 'B';
  answers: Map<number, { choiceIdx: number; text?: string; msTaken: number; correct: boolean; earned: number }>;
  online: boolean;
}

interface RacePlayer {
  userId: string;
  displayName: string;
  solved: number;
  wrongStreak: number;
  current: { text: string; answer: string } | null;
  startedAt: number;
}

type Phase = 'lobby' | 'question' | 'leaderboard' | 'race' | 'finished';

interface RoomState {
  sessionId: string;
  hostId: string;
  roomCode: string;
  gameType: 'quick_quiz' | 'tug_of_war' | 'math_race';
  questions: GameQuestion[];
  secondsPerQuestion: number;
  raceDurationSec: number;
  raceDifficulty: number;
  phase: Phase;
  currentIndex: number;
  questionEndsAt: number;
  questionStartAt: number;
  players: Map<string, PlayerInfo>;
  racePlayers: Map<string, RacePlayer>;
  ropePos: number;
  raceEndsAt: number;
  timer: NodeJS.Timeout | null;
}

const rooms = new Map<string, RoomState>();
let ioRef: IOServer | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
void sleep;

interface SocketPayload {
  userId: string;
  role: string;
}

function authenticate(socket: Socket): SocketPayload | null {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = getUserById(payload.sub);
    if (!user || user.status === 'locked') return null;
    return { userId: user.id, role: user.role };
  } catch {
    return null;
  }
}

function leaderboard(room: RoomState): { name: string; score: number; team?: string }[] {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map((p) => ({ name: p.displayName, score: p.score, team: p.team }));
}

function broadcastLeaderboard(room: RoomState): void {
  ioRef?.to(`game:${room.roomCode}`).emit('leaderboard:update', { rows: leaderboard(room), phase: room.phase });
}

function broadcastRope(room: RoomState): void {
  const teamA = [...room.players.values()].filter((p) => p.team === 'A');
  const teamB = [...room.players.values()].filter((p) => p.team === 'B');
  ioRef?.to(`game:${room.roomCode}`).emit('tug:update', {
    ropePos: Math.round(room.ropePos),
    teamA: { name: 'Đội A', members: teamA.map((p) => p.displayName), score: teamA.reduce((s, p) => s + p.score, 0) },
    teamB: { name: 'Đội B', members: teamB.map((p) => p.displayName), score: teamB.reduce((s, p) => s + p.score, 0) },
  });
}

function broadcastRace(room: RoomState): void {
  const rows = [...room.racePlayers.values()]
    .sort((a, b) => b.solved - a.solved || a.startedAt - b.startedAt)
    .slice(0, 15)
    .map((r) => ({ name: r.displayName, solved: r.solved }));
  ioRef?.to(`game:${room.roomCode}`).emit('race:update', { rows });
}

function generateMathProblem(difficulty: number): { text: string; answer: string } {
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  let text: string;
  let answer: number;
  if (difficulty <= 1) {
    const a = rand(5, 30);
    const b = rand(5, 30);
    if (Math.random() < 0.5) {
      text = `${a} + ${b}`;
      answer = a + b;
    } else {
      const big = Math.max(a, b);
      const small = Math.min(a, b);
      text = `${big} − ${small}`;
      answer = big - small;
    }
  } else if (difficulty === 2) {
    const mode = rand(0, 2);
    if (mode === 0) {
      const a = rand(3, 12);
      const b = rand(3, 12);
      text = `${a} × ${b}`;
      answer = a * b;
    } else if (mode === 1) {
      const b = rand(2, 12);
      const answerV = rand(2, 12);
      text = `${b * answerV} : ${b}`;
      answer = answerV;
    } else {
      const a = rand(10, 60);
      const b = rand(10, 40);
      const c = rand(5, 25);
      text = `${a} + ${b} − ${c}`;
      answer = a + b - c;
    }
  } else {
    const mode = rand(0, 2);
    if (mode === 0) {
      const a = rand(11, 25);
      const b = rand(6, 19);
      text = `${a} × ${b}`;
      answer = a * b;
    } else if (mode === 1) {
      const a = rand(4, 15);
      const b = rand(4, 15);
      const c = rand(2, 40);
      text = `${a} × ${b} − ${c}`;
      answer = a * b - c;
    } else {
      const b = rand(3, 16);
      const answerV = rand(6, 30);
      text = `${b * answerV} : ${b} + ${rand(3, 20)}`;
      answer = answerV + rand(3, 20);
    }
  }
  return { text, answer: String(answer) };
}

function startQuestion(room: RoomState): void {
  if (room.currentIndex >= room.questions.length) {
    finishGame(room);
    return;
  }
  room.phase = 'question';
  room.questionStartAt = Date.now();
  room.questionEndsAt = Date.now() + room.secondsPerQuestion * 1000;
  const q = room.questions[room.currentIndex];
  if (!q) return;
  ioRef?.to(`game:${room.roomCode}`).emit('question:show', {
    index: room.currentIndex,
    total: room.questions.length,
    question: { id: q.id, type: q.type, content: q.content, options: q.options ?? [] },
    endsAt: room.questionEndsAt,
    durationSec: room.secondsPerQuestion,
  });
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => revealAnswer(room), room.secondsPerQuestion * 1000 + 400);
}

function isAnswerCorrect(q: GameQuestion, choiceIdx: number, text: string | undefined): boolean {
  if (q.type === 'mcq') return choiceIdx === q.correctIdx;
  const normalized = (text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized.length > 0 && normalized === (q.correctText ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function revealAnswer(room: RoomState): void {
  if (!room || room.phase !== 'question') return;
  room.phase = 'leaderboard';
  const q = room.questions[room.currentIndex];
  if (!q) return;
  const totalMs = room.secondsPerQuestion * 1000;
  const optionCount = q.options?.length ?? 0;
  const counts = new Array(Math.max(optionCount, 1)).fill(0);
  let correctCount = 0;
  let answeredCount = 0;

  for (const player of room.players.values()) {
    const ans = player.answers.get(room.currentIndex);
    if (!ans) continue;
    answeredCount++;
    ans.correct = isAnswerCorrect(q, ans.choiceIdx, ans.text);
    if (q.type === 'mcq') counts[ans.choiceIdx] = (counts[ans.choiceIdx] ?? 0) + 1;
    if (ans.correct && !ans.earned) {
      const remainingRatio = Math.max(0, (room.questionEndsAt - (room.questionStartAt + ans.msTaken)) / totalMs);
      ans.earned = Math.round(60 + 40 * remainingRatio);
      player.score += ans.earned;
      if (ans.correct) correctCount++;
    } else if (ans.correct) {
      correctCount++;
    }
  }

  ioRef?.to(`game:${room.roomCode}`).emit('answer:reveal', {
    index: room.currentIndex,
    correctIdx: q.type === 'mcq' ? q.correctIdx : -1,
    correctText: q.type === 'fill' ? q.correctText : undefined,
    counts,
    correctCount,
    playerCount: answeredCount,
  });

  if (room.gameType === 'tug_of_war') {
    const teamStats = { A: { correct: 0, answered: 0 }, B: { correct: 0, answered: 0 } };
    for (const player of room.players.values()) {
      const ans = player.answers.get(room.currentIndex);
      if (!player.team || !ans) continue;
      const stat = teamStats[player.team];
      if (stat) {
        stat.answered += 1;
        if (ans.correct) stat.correct += 1;
      }
    }
    const ratioA = teamStats.A!.answered > 0 ? teamStats.A!.correct / teamStats.A!.answered : 0;
    const ratioB = teamStats.B!.answered > 0 ? teamStats.B!.correct / teamStats.B!.answered : 0;
    const delta = Math.max(-35, Math.min(35, Math.round((ratioA - ratioB) * 45)));
    room.ropePos = Math.max(-100, Math.min(100, room.ropePos + delta));
    broadcastRope(room);
  }

  broadcastLeaderboard(room);
  db.prepare('UPDATE game_sessions SET current_question_index = ? WHERE id = ?').run(room.currentIndex, room.sessionId);
}

function nextStep(room: RoomState): void {
  room.currentIndex++;
  if (room.gameType === 'tug_of_war' && Math.abs(room.ropePos) >= 100) {
    finishGame(room);
    return;
  }
  if (room.currentIndex >= room.questions.length) {
    finishGame(room);
  } else {
    startQuestion(room);
  }
}

function finishGame(room: RoomState): void {
  room.phase = 'finished';
  if (room.timer) clearTimeout(room.timer);

  let podium: { rank: number; name: string; score: number }[] = [];
  if (room.gameType === 'math_race') {
    podium = [...room.racePlayers.values()]
      .sort((a, b) => b.solved - a.solved || a.startedAt - b.startedAt)
      .slice(0, 20)
      .map((r, i) => ({ rank: i + 1, name: r.displayName, score: r.solved }));
  } else if (room.gameType === 'tug_of_war') {
    const teamScore = (team: 'A' | 'B') =>
      [...room.players.values()].filter((p) => p.team === team).reduce((s, p) => s + p.score, 0);
    const winnerTeam: 'A' | 'B' =
      Math.abs(room.ropePos) >= 100 ? (room.ropePos > 0 ? 'A' : 'B') : teamScore('A') >= teamScore('B') ? 'A' : 'B';
    ioRef?.to(`game:${room.roomCode}`).emit('tug:result', {
      winnerTeam,
      ropePos: Math.round(room.ropePos),
      teamA: teamScore('A'),
      teamB: teamScore('B'),
    });
    podium = [...room.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, name: p.displayName, score: p.score }));
  } else {
    podium = [...room.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, name: p.displayName, score: p.score }));
  }

  ioRef?.to(`game:${room.roomCode}`).emit('game:finished', { podium });

  try {
    const insertResult = db.prepare(
      `INSERT INTO game_results (game_session_id, student_id, score, rank, detail_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(game_session_id, student_id) DO UPDATE SET score = excluded.score, rank = excluded.rank`
    );
    const nameToPlayer = new Map<string, string>();
    for (const p of room.players.values()) nameToPlayer.set(p.displayName, p.userId);
    for (const r of room.racePlayers.values()) nameToPlayer.set(r.displayName, r.userId);

    tx(() => {
      for (const entry of podium) {
        const userId = nameToPlayer.get(entry.name);
        if (userId) {
          insertResult.run(room.sessionId, userId, entry.score, entry.rank, '{}');
        }
      }
      db.prepare("UPDATE game_sessions SET status = 'finished', finished_at = datetime('now') WHERE id = ?").run(room.sessionId);
    });
  } catch (err) {
    console.error('[game] persist results failed', err);
  }
  setTimeout(() => rooms.delete(room.roomCode), 10 * 60_000);
}

function startRace(room: RoomState): void {
  room.phase = 'race';
  room.raceEndsAt = Date.now() + room.raceDurationSec * 1000;
  ioRef?.to(`game:${room.roomCode}`).emit('race:start', { endsAt: room.raceEndsAt, durationSec: room.raceDurationSec });
  for (const socketId of connectedSocketsIn(room.roomCode)) {
    const socket = ioRef?.sockets.sockets.get(socketId);
    if (!socket || socket.data.role !== 'student') continue;
    sendRaceProblem(room, socket);
  }
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => finishGame(room), room.raceDurationSec * 1000 + 500);
}

const socketRoomsIndex = new Map<string, Set<string>>();

function connectedSocketsIn(roomCode: string): string[] {
  return [...(socketRoomsIndex.get(roomCode) ?? [])];
}

function sendRaceProblem(room: RoomState, socket: Socket): void {
  const userId = String(socket.data.userId);
  let rp = room.racePlayers.get(userId);
  if (!rp) {
    const user = getUserById(userId);
    rp = {
      userId,
      displayName: user ? toPublicUser(user).displayName : 'Học viên',
      solved: 0,
      wrongStreak: 0,
      current: null,
      startedAt: Date.now(),
    };
    room.racePlayers.set(userId, rp);
  }
  rp.current = generateMathProblem(room.raceDifficulty);
  socket.emit('math:problem', { text: rp.current.text, endsAt: room.raceEndsAt });
}

function loadRoomFromDb(sessionId: string): RoomState | null {
  const row = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId) as
    | {
        id: string;
        host_teacher_id: string;
        room_code: string;
        status: string;
        game_type: string;
        question_ids_json: string;
        config_json: string;
        current_question_index: number;
      }
    | undefined;
  if (!row || row.status === 'finished') return null;

  const cfg = JSON.parse(row.config_json) as { secondsPerQuestion?: number; durationSec?: number; difficulty?: number };
  const gameType = (['quick_quiz', 'tug_of_war', 'math_race'] as const).includes(row.game_type as never)
    ? (row.game_type as RoomState['gameType'])
    : 'quick_quiz';

  let questions: GameQuestion[] = [];
  const ids = JSON.parse(row.question_ids_json) as string[];
  if (ids.length > 0 && gameType !== 'math_race') {
    const placeholders = ids.map(() => '?').join(',');
    const bankRows = queryAll<{ id: string; type: string; content: string; options_json: string; correct_answer: string }>(
      `SELECT id, type, content, options_json, correct_answer FROM questions WHERE id IN (${placeholders})`,
      ...ids
    );
    const orderMap = new Map(ids.map((qid, i) => [qid, i]));
    const sorted = [...bankRows].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
    questions = sorted.map((q) => {
      if (q.type === 'fill') {
        return { id: q.id, type: 'fill' as const, content: q.content, correctText: q.correct_answer };
      }
      const rawOptions = (JSON.parse(q.options_json) as string[]).map((o) => o.replace(/^([A-D])[\.\:\)]\s+/, ''));
      let correctIdx = /^[A-D]$/.test(q.correct_answer) ? q.correct_answer.charCodeAt(0) - 65 : 0;
      if (correctIdx < 0 || correctIdx >= rawOptions.length) correctIdx = 0;
      return { id: q.id, type: 'mcq' as const, content: q.content, options: rawOptions, correctIdx };
    });
  }

  const existing = rooms.get(row.room_code);
  if (existing) return existing;
  const room: RoomState = {
    sessionId: row.id,
    hostId: row.host_teacher_id,
    roomCode: row.room_code,
    gameType,
    questions,
    secondsPerQuestion: Math.min(Math.max(cfg.secondsPerQuestion ?? 20, 5), 120),
    raceDurationSec: Math.min(Math.max(cfg.durationSec ?? 120, 30), 600),
    raceDifficulty: Math.min(Math.max(cfg.difficulty ?? 1, 1), 3),
    phase: row.status === 'running' ? (gameType === 'math_race' ? 'race' : 'question') : 'lobby',
    currentIndex: row.current_question_index,
    questionEndsAt: 0,
    questionStartAt: 0,
    players: new Map(),
    racePlayers: new Map(),
    ropePos: 0,
    raceEndsAt: 0,
    timer: null,
  };
  rooms.set(row.room_code, room);
  return room;
}

export function initGameEngine(httpServer: HttpServer): IOServer {
  const io = new IOServer(httpServer, {
    cors: { origin: false },
    maxHttpBufferSize: 1e6,
  });
  ioRef = io;

  io.use((socket, next) => {
    const payload = authenticate(socket);
    if (!payload) {
      next(new Error('unauthorized'));
      return;
    }
    socket.data.userId = payload.userId;
    socket.data.role = payload.role;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('game:host-attach', (raw: unknown) => {
      const parsed = z.object({ sessionId: z.string() }).safeParse(raw);
      if (!parsed.success || socket.data.role === 'student') return;
      const room = findRoomBySession(parsed.data.sessionId) ?? loadRoomFromDb(parsed.data.sessionId);
      if (!room) {
        socket.emit('game:error', { message: 'Phiên game không tồn tại hoặc đã kết thúc' });
        return;
      }
      void socket.join(`game:${room.roomCode}`);
      socket.data.roomCode = room.roomCode;
      socket.emit('host:sync', {
        gameType: room.gameType,
        phase: room.phase,
        currentIndex: room.currentIndex,
        totalQuestions: room.questions.length,
        ropePos: Math.round(room.ropePos),
        players: [...room.players.values()].map((p) => ({ name: p.displayName, score: p.score })),
        raceRows: [...room.racePlayers.values()].map((r) => ({ name: r.displayName, solved: r.solved })),
      });
    });

    socket.on('game:join', (raw: unknown) => {
      const parsed = zRoom.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student' || !socket.data.userId) return;
      const room = rooms.get(parsed.data.roomCode);
      if (!room) {
        socket.emit('game:error', { message: 'Không tìm thấy phòng. Kiểm tra lại mã phòng.' });
        return;
      }
      const user = getUserById(socket.data.userId);
      if (!user) return;
      const publicUser = toPublicUser(user);

      if (room.gameType === 'math_race') {
        if (!room.racePlayers.has(publicUser.id)) {
          room.racePlayers.set(publicUser.id, {
            userId: publicUser.id,
            displayName: publicUser.displayName,
            solved: 0,
            wrongStreak: 0,
            current: null,
            startedAt: Date.now(),
          });
        }
        void socket.join(`game:${room.roomCode}`);
        socket.data.roomCode = room.roomCode;
        trackSocketRoom(socket, room.roomCode);
        socket.emit('game:joined', { gameType: room.gameType, phase: room.phase, endsAt: room.raceEndsAt });
        broadcastRace(room);
        if (room.phase === 'race') sendRaceProblem(room, socket);
        return;
      }

      let player = room.players.get(publicUser.id);
      if (!player) {
        const team: 'A' | 'B' = [...room.players.values()].filter((p) => p.team === 'A').length <=
          [...room.players.values()].filter((p) => p.team === 'B').length
          ? 'A'
          : 'B';
        player = {
          userId: publicUser.id,
          displayName: publicUser.displayName,
          score: 0,
          team: room.gameType === 'tug_of_war' ? team : undefined,
          answers: new Map(),
          online: true,
        };
        room.players.set(publicUser.id, player);
      } else {
        player.online = true;
      }
      void socket.join(`game:${room.roomCode}`);
      socket.data.roomCode = room.roomCode;
      trackSocketRoom(socket, room.roomCode);

      socket.emit('game:joined', { gameType: room.gameType, phase: room.phase, team: player.team });
      io.to(`game:${room.roomCode}`).emit('lobby:update', {
        count: [...room.players.values()].filter((p) => p.online).length,
        players: [...room.players.values()].map((p) => ({ name: p.displayName, team: p.team })),
      });
      if (room.gameType === 'tug_of_war') broadcastRope(room);
      if (room.phase === 'question') {
        const q = room.questions[room.currentIndex];
        if (q) {
          socket.emit('question:show', {
            index: room.currentIndex,
            total: room.questions.length,
            question: { id: q.id, type: q.type, content: q.content, options: q.options ?? [] },
            endsAt: room.questionEndsAt,
            durationSec: room.secondsPerQuestion,
          });
        }
      }
    });

    socket.on('game:host-start', () => {
      const room = rooms.get(String(socket.data.roomCode));
      if (!room || room.hostId !== socket.data.userId) return;
      if (room.phase !== 'lobby') return;
      db.prepare("UPDATE game_sessions SET status = 'running', started_at = datetime('now') WHERE id = ?").run(room.sessionId);
      if (room.gameType === 'math_race') {
        startRace(room);
        return;
      }
      if (room.gameType === 'tug_of_war') broadcastRope(room);
      room.currentIndex = 0;
      startQuestion(room);
    });

    socket.on('game:host-next', () => {
      const room = rooms.get(String(socket.data.roomCode));
      if (!room || room.hostId !== socket.data.userId) return;
      if (room.gameType === 'math_race') {
        if (room.timer) clearTimeout(room.timer);
        finishGame(room);
        return;
      }
      if (room.phase === 'question' && room.timer) {
        clearTimeout(room.timer);
        revealAnswer(room);
        return;
      }
      if (room.phase === 'leaderboard') nextStep(room);
    });

    socket.on('game:answer', (raw: unknown) => {
      const parsed = zAnswer.safeParse(raw ?? {});
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || (room.phase !== 'question')) return;
      const player = room.players.get(String(socket.data.userId));
      if (!player) return;
      if (player.answers.has(room.currentIndex)) return;
      const msTaken = Math.max(0, Date.now() - room.questionStartAt);
      if (msTaken > room.secondsPerQuestion * 1000 + 600) return;
      const q = room.questions[room.currentIndex];
      const choiceIdx = q?.type === 'fill' ? -1 : parsed.data.choiceIdx;
      player.answers.set(room.currentIndex, {
        choiceIdx,
        text: parsed.data.text,
        msTaken,
        correct: false,
        earned: 0,
      });
    });

    socket.on('math:answer', (raw: unknown) => {
      const parsed = zMathAnswer.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || room.gameType !== 'math_race' || room.phase !== 'race') return;
      const rp = room.racePlayers.get(String(socket.data.userId));
      if (!rp || !rp.current) return;
      const given = String(parsed.data.answer).trim();
      if (given === rp.current.answer) {
        rp.solved += 1;
        rp.wrongStreak = 0;
        rp.current = generateMathProblem(room.raceDifficulty);
        socket.emit('math:problem', { text: rp.current.text, endsAt: room.raceEndsAt });
        broadcastRace(room);
      } else {
        rp.wrongStreak += 1;
        socket.emit('math:wrong', { streak: rp.wrongStreak });
      }
    });

    socket.on('disconnecting', () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      untrackSocketRoom(socket.id, code);
      const room = rooms.get(code);
      if (room) {
        const player = room.players.get(String(socket.data.userId));
        if (player) player.online = false;
        io.to(`game:${room.roomCode}`).emit('lobby:update', {
          count: [...room.players.values()].filter((p) => p.online).length,
          players: [...room.players.values()].map((p) => ({ name: p.displayName, team: p.team })),
        });
      }
    });
  });

  setInterval(() => {
    for (const [code, room] of rooms) {
      if (room.phase === 'finished' && Date.now() - room.questionEndsAt > 10 * 60_000) {
        rooms.delete(code);
        socketRoomsIndex.delete(code);
      }
    }
  }, 60_000);

  return io;
}

function trackSocketRoom(socket: Socket, roomCode: string): void {
  const set = socketRoomsIndex.get(roomCode) ?? new Set<string>();
  set.add(socket.id);
  socketRoomsIndex.set(roomCode, set);
}

function untrackSocketRoom(socketId: string, roomCode: string): void {
  const set = socketRoomsIndex.get(roomCode);
  if (set) set.delete(socketId);
}

function findRoomBySession(sessionId: string): RoomState | null {
  for (const room of rooms.values()) {
    if (room.sessionId === sessionId) return room;
  }
  return null;
}
