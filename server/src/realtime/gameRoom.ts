import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { JWT_SECRET } from '../config.js';
import { db, tx, getUserById, toPublicUser } from '../db/connection.js';

const zRoom = z.object({ roomCode: z.string().length(6) });
const zAnswer = z.object({ choiceIdx: z.number().int().min(0).max(5) });

interface PlayerInfo {
  userId: string;
  displayName: string;
  score: number;
  answers: Map<number, { choiceIdx: number; msTaken: number; correct: boolean; earned: number }>;
  online: boolean;
}

interface RoomState {
  sessionId: string;
  hostId: string;
  roomCode: string;
  questions: { id: string; content: string; options: string[]; correctIdx: number }[];
  secondsPerQuestion: number;
  phase: 'lobby' | 'question' | 'leaderboard' | 'finished';
  currentIndex: number;
  questionEndsAt: number;
  questionStartAt: number;
  players: Map<string, PlayerInfo>;
  timer: NodeJS.Timeout | null;
}

const rooms = new Map<string, RoomState>();
let ioRef: IOServer | null = null;

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

function leaderboard(room: RoomState): { name: string; score: number }[] {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map((p) => ({ name: p.displayName, score: p.score }));
}

function broadcastLeaderboard(room: RoomState): void {
  ioRef?.to(`game:${room.roomCode}`).emit('leaderboard:update', { rows: leaderboard(room), phase: room.phase });
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
    question: { id: q.id, content: q.content, options: q.options },
    endsAt: room.questionEndsAt,
    durationSec: room.secondsPerQuestion,
  });
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => revealAnswer(room), room.secondsPerQuestion * 1000 + 300);
}

function revealAnswer(room: RoomState): void {
  if (!room || room.phase !== 'question') return;
  room.phase = 'leaderboard';
  const q = room.questions[room.currentIndex];
  if (!q) return;
  const totalMs = room.secondsPerQuestion * 1000;
  for (const player of room.players.values()) {
    const ans = player.answers.get(room.currentIndex);
    if (ans) {
      ans.correct = ans.choiceIdx === q.correctIdx;
      if (ans.correct && !ans.earned) {
        const remainingRatio = Math.max(0, (room.questionEndsAt - (room.questionStartAt + ans.msTaken)) / totalMs);
        ans.earned = Math.round(60 + 40 * remainingRatio);
        player.score += ans.earned;
      }
    }
  }
  ioRef?.to(`game:${room.roomCode}`).emit('answer:reveal', {
    index: room.currentIndex,
    correctIdx: q.correctIdx,
    counts: countAnswers(room),
    correctCount: [...room.players.values()].filter((p) => p.answers.get(room.currentIndex)?.correct).length,
    playerCount: [...room.players.values()].filter((p) => p.answers.has(room.currentIndex)).length,
  });
  broadcastLeaderboard(room);
  db.prepare("UPDATE game_sessions SET current_question_index = ? WHERE id = ?").run(room.currentIndex, room.sessionId);
}

function countAnswers(room: RoomState): number[] {
  const q = room.questions[room.currentIndex];
  if (!q) return [];
  const counts = new Array(q.options.length).fill(0);
  for (const p of room.players.values()) {
    const a = p.answers.get(room.currentIndex);
    if (a) counts[a.choiceIdx] = (counts[a.choiceIdx] ?? 0) + 1;
  }
  return counts;
}

function nextStep(room: RoomState): void {
  room.currentIndex++;
  if (room.currentIndex >= room.questions.length) {
    finishGame(room);
  } else {
    startQuestion(room);
  }
}

function finishGame(room: RoomState): void {
  room.phase = 'finished';
  if (room.timer) clearTimeout(room.timer);
  const podium = [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, name: p.displayName, score: p.score }));
  ioRef?.to(`game:${room.roomCode}`).emit('game:finished', { podium });
  try {
    const insertResult = db.prepare(
      `INSERT INTO game_results (game_session_id, student_id, score, rank, detail_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(game_session_id, student_id) DO UPDATE SET score = excluded.score, rank = excluded.rank`
    );
    tx(() => {
      for (const entry of podium) {
        const player = [...room.players.values()].find((p) => p.displayName === entry.name);
        if (player) insertResult.run(room.sessionId, player.userId, entry.score, entry.rank, '{}');
      }
      db.prepare("UPDATE game_sessions SET status = 'finished', finished_at = datetime('now') WHERE id = ?").run(room.sessionId);
    });
  } catch (err) {
    console.error('[game] persist results failed', err);
  }
  setTimeout(() => rooms.delete(room.roomCode), 10 * 60_000);
}

function loadRoomFromDb(sessionId: string): RoomState | null {
  const row = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId) as
    | { id: string; host_teacher_id: string; room_code: string; status: string; question_ids_json: string; config_json: string; current_question_index: number }
    | undefined;
  if (!row || row.status === 'finished') return null;
  const ids = JSON.parse(row.question_ids_json) as string[];
  if (ids.length === 0) return null;
  const placeholders = ids.map(() => '?').join(',');
  const bankRows = db.prepare(`SELECT * FROM questions WHERE id IN (${placeholders})`).all(...ids) as {
    id: string;
    content: string;
    options_json: string;
    correct_answer: string;
  }[];
  const orderMap = new Map(ids.map((qid, i) => [qid, i]));
  const sorted = [...bankRows].sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
  const cfg = JSON.parse(row.config_json) as { secondsPerQuestion?: number };
  const questions = sorted
    .filter((q) => {
      try {
        JSON.parse(q.options_json);
        return true;
      } catch {
        return false;
      }
    })
    .map((q) => {
      const options = (JSON.parse(q.options_json) as string[]).map((o) => o.replace(/^([A-D])[\.\:\)]\s+/, ''));
      let correctIdx = /^[A-D]$/.test(q.correct_answer) ? q.correct_answer.charCodeAt(0) - 65 : 0;
      if (correctIdx < 0 || correctIdx >= options.length) correctIdx = 0;
      return { id: q.id, content: q.content, options, correctIdx };
    });
  const existing = rooms.get(row.room_code);
  if (existing) return existing;
  const room: RoomState = {
    sessionId: row.id,
    hostId: row.host_teacher_id,
    roomCode: row.room_code,
    questions,
    secondsPerQuestion: Math.min(Math.max(cfg.secondsPerQuestion ?? 20, 5), 120),
    phase: row.status === 'running' ? 'question' : 'lobby',
    currentIndex: row.current_question_index,
    questionEndsAt: 0,
    questionStartAt: 0,
    players: new Map(),
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
        socket.emit('game:error', { message: 'PhiÃªn game khÃ´ng tá»“n táº¡i hoáº·c Ä‘Ã£ káº¿t thÃºc' });
        return;
      }
      void socket.join(`game:${room.roomCode}`);
      socket.data.roomCode = room.roomCode;
      socket.data.roomCode = room.roomCode;
      socket.emit('host:sync', {
        phase: room.phase,
        currentIndex: room.currentIndex,
        totalQuestions: room.questions.length,
        players: [...room.players.values()].map((p) => ({ name: p.displayName, score: p.score })),
      });
    });

    socket.on('game:join', (raw: unknown) => {
      const parsed = zRoom.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student' || !socket.data.userId) return;
      const room = rooms.get(parsed.data.roomCode);
      if (!room) {
        socket.emit('game:error', { message: 'KhÃ´ng tÃ¬m tháº¥y phÃ²ng. Kiá»ƒm tra láº¡i mÃ£ phÃ²ng.' });
        return;
      }
      const user = getUserById(socket.data.userId);
      if (!user) return;
      const publicUser = toPublicUser(user);
      let player = room.players.get(publicUser.id);
      if (!player) {
        player = { userId: publicUser.id, displayName: publicUser.displayName, score: 0, answers: new Map(), online: true };
        room.players.set(publicUser.id, player);
      } else {
        player.online = true;
      }
      void socket.join(`game:${room.roomCode}`);
      socket.data.roomCode = room.roomCode;
      io.to(`game:${room.roomCode}`).emit('lobby:update', {
        count: [...room.players.values()].filter((p) => p.online).length,
        players: [...room.players.values()].map((p) => ({ name: p.displayName })),
      });
      if (room.phase === 'question') startQuestionForSocket(socket, room);
      else socket.emit('game:state', { phase: room.phase, currentIndex: room.currentIndex });
    });

    socket.on('game:host-start', () => {
      const room = rooms.get(String(socket.data.roomCode));
      if (!room || room.hostId !== socket.data.userId) return;
      if (room.phase !== 'lobby') return;
      db.prepare("UPDATE game_sessions SET status = 'running', started_at = datetime('now') WHERE id = ?").run(room.sessionId);
      room.currentIndex = 0;
      startQuestion(room);
    });

    socket.on('game:host-next', () => {
      const room = rooms.get(String(socket.data.roomCode));
      if (!room || room.hostId !== socket.data.userId) return;
      if (room.phase === 'question' && room.timer) {
        clearTimeout(room.timer);
        revealAnswer(room);
        return;
      }
      if (room.phase === 'leaderboard') nextStep(room);
    });

    socket.on('game:answer', (raw: unknown) => {
      const parsed = zAnswer.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student') return;
      const roomCode = String(socket.data.roomCode ?? '');
      const room = rooms.get(roomCode);
      if (!room || room.phase !== 'question') return;
      const player = room.players.get(String(socket.data.userId));
      if (!player) return;
      if (player.answers.has(room.currentIndex)) return;
      const msTaken = Math.max(0, Date.now() - room.questionStartAt);
      if (msTaken > room.secondsPerQuestion * 1000 + 500) return;
      player.answers.set(room.currentIndex, { choiceIdx: parsed.data.choiceIdx, msTaken, correct: false, earned: 0 });
    });

    socket.on('disconnecting', () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const room = rooms.get(code);
      if (room) {
        const player = room.players.get(String(socket.data.userId));
        if (player) player.online = false;
        io.to(`game:${room.roomCode}`).emit('lobby:update', {
          count: [...room.players.values()].filter((p) => p.online).length,
          players: [...room.players.values()].map((p) => ({ name: p.displayName })),
        });
      }
    });
  });

  setInterval(() => {
    for (const [code, room] of rooms) {
      if (room.phase === 'finished' && Date.now() - room.questionEndsAt > 10 * 60_000) rooms.delete(code);
    }
  }, 60_000);

  return io;
}

function startQuestionForSocket(socket: Socket, room: RoomState): void {
  const q = room.questions[room.currentIndex];
  if (!q) return;
  socket.emit('question:show', {
    index: room.currentIndex,
    total: room.questions.length,
    question: { id: q.id, content: q.content, options: q.options },
    endsAt: room.questionEndsAt,
    durationSec: room.secondsPerQuestion,
  });
}

function findRoomBySession(sessionId: string): RoomState | null {
  for (const room of rooms.values()) {
    if (room.sessionId === sessionId) return room;
  }
  return null;
}
