import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server as IOServer, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { JWT_SECRET } from '../config.js';
import { checkBingoLines, generateBingoCard, generateMathProblem, generateMemoryCards, scrambleWord, sleep } from './gameUtils.js';

interface SocketPayload {
  userId: string;
  role: string;
}
import { db, queryAll, tx, getUserById, toPublicUser } from '../db/connection.js';

const zRoom = z.object({ roomCode: z.string().length(6) });
const zAnswer = z.object({ choiceIdx: z.number().int().min(-1).max(9).default(-1), text: z.string().max(500).optional() });
const zMathAnswer = z.object({ answer: z.union([z.string().max(50), z.number()]) });
const zVerdict = z.object({ userId: z.string(), correct: z.boolean() });
const zCwTry = z.object({ rowIndex: z.number().int().min(0).max(9), word: z.string().min(1).max(60) });
const zBingoMark = z.object({ number: z.number().int().min(1).max(75) });
const zMemoryFlip = z.object({ cardIndex: z.number().int().min(0).max(23) });
const zWordScrambleGuess = z.object({ word: z.string().min(1).max(60) });
const zQuizShowAnswer = z.object({ choiceIdx: z.number().int().min(-1).max(3).default(-1), lifeline: z.enum(['fiftyFifty', 'askAudience', 'phoneFriend']).optional() });
const zCircuitDraw = z.object({
  components: z.array(z.object({
    id: z.string(),
    type: z.string(),
    x: z.number(),
    y: z.number(),
    rotation: z.number().default(0),
    properties: z.record(z.string(), z.unknown()).default({})
  })),
  wires: z.array(z.object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    fromPort: z.string().optional(),
    toPort: z.string().optional()
  })),
  submitted: z.boolean().default(false),
});
const zCircuitSimulate = z.object({
  action: z.enum(['start', 'stop', 'step', 'reset']),
  inputs: z.record(z.string(), z.union([z.number(), z.boolean()])).optional(),
  timeStep: z.number().optional()
});
const zCircuitHostControl = z.object({
  action: z.enum(['pause', 'resume', 'extend', 'evaluate', 'skip', 'restart']),
});
const CIRCUIT_EXTENSION_MS = 30_000;
const CIRCUIT_MAX_REMAINING_MS = 10 * 60_000;
const zCircuitInspect = z.object({
  userId: z.string().min(1).max(120),
});
const zCircuitTeacherMessage = z.object({
  userId: z.string().min(1).max(120),
  kind: z.enum(['hint', 'retry']),
  message: z.string().max(300).optional(),
});
const zCircuitTeacherMessageAck = z.object({
  messageId: z.string().uuid(),
});

interface PuzzleDef {
  keyword: string;
  rows: { clue: string; word: string }[];
}

type GameType = 'quick_quiz' | 'tug_of_war' | 'math_race' | 'hand_raise' | 'crossword' | 'bingo' | 'memory_match' | 'word_scramble' | 'quiz_show' | 'circuit_draw' | 'circuit_simulate';

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

interface BingoPlayer {
  userId: string;
  displayName: string;
  card: number[][]; // 5x5 card with numbers
  marked: boolean[][]; // 5x5 marked cells
  lines: number; // completed lines (row, col, diag)
  score: number;
  bingo: boolean;
}

interface MemoryMatchPlayer {
  userId: string;
  displayName: string;
  score: number;
  matches: number;
  currentFlipped: number[]; // indices of currently flipped cards
  lastFlipTime: number;
}

interface WordScramblePlayer {
  userId: string;
  displayName: string;
  score: number;
  solved: number;
  currentWord: string | null;
  currentScrambled: string | null;
  attempts: number;
}

interface QuizShowPlayer {
  userId: string;
  displayName: string;
  score: number;
  streak: number;
  lifelines: { fiftyFifty: boolean; askAudience: boolean; phoneFriend: boolean };
  currentQuestion: number;
  answers: Map<number, { choiceIdx: number; lifeline?: string }>;
}

interface CircuitDrawPlayer {
  userId: string;
  displayName: string;
  score: number;
  circuit: { components: any[]; wires: any[] } | null;
  submitted: boolean;
  verified: boolean;
  feedback: string;
}

type CircuitValidationCode = 'correct' | 'invalid_data' | 'wire_count' | 'component_count' | 'connection';

interface CircuitSimulatePlayer {
  userId: string;
  displayName: string;
  score: number;
  circuit: { components: any[]; wires: any[] } | null;
  circuitChallengeId: string | null;
  simulationState: 'idle' | 'running' | 'paused' | 'completed' | 'start' | 'stop' | 'step' | 'reset';
  measurements: Record<string, number>;
  completedChallenges: string[];
  lastActivityAt: number;
  submissionAttempts: number;
  lastSubmissionAt: number | null;
  lastValidationCode: CircuitValidationCode | null;
  lastValidationFeedback: string | null;
  totalSubmissionAttempts: number;
  incorrectSubmissionAttempts: number;
}

interface CircuitDebriefRow {
  userId: string;
  name: string;
  completedCount: number;
  totalChallenges: number;
  totalSubmissionAttempts: number;
  incorrectSubmissionAttempts: number;
  score: number;
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
  learners: CircuitDebriefRow[];
}

type Phase = 'lobby' | 'question' | 'leaderboard' | 'race' | 'crossword' | 'bingo' | 'memory_match' | 'word_scramble' | 'quiz_show' | 'circuit_draw' | 'circuit_simulate' | 'finished';

interface RoomState {
  sessionId: string;
  hostId: string;
  roomCode: string;
  gameType: GameType;
  questions: GameQuestion[];
  secondsPerQuestion: number;
  raceDurationSec: number;
  raceDifficulty: number;
  pointsPerCorrect: number;
  classId: string | null;
  puzzle: PuzzleDef | null;
  solvedRows: Set<number>;
  hands: Map<string, string>;
  activePick: { userId: string; name: string } | null;
  locked: boolean;
  lockOnStart: boolean;
  blacklist: Set<string>;
  phase: Phase;
  currentIndex: number;
  questionEndsAt: number;
  questionStartAt: number;
  players: Map<string, PlayerInfo>;
  racePlayers: Map<string, RacePlayer>;
  ropePos: number;
  raceEndsAt: number;
  timer: NodeJS.Timeout | null;
  // Bingo
  bingoNumbers: number[];
  bingoCalled: number[];
  bingoPlayers: Map<string, BingoPlayer>;
  // Memory Match
  memoryCards: { id: number; value: string; matched: boolean }[];
  memoryPlayers: Map<string, MemoryMatchPlayer>;
  memoryFlipped: number[];
  // Word Scramble
  wordScrambleWords: { original: string; scrambled: string }[];
  wordScramblePlayers: Map<string, WordScramblePlayer>;
  // Quiz Show
  quizShowQuestions: GameQuestion[];
  quizShowPlayers: Map<string, QuizShowPlayer>;
  quizShowCurrentQuestion: number;
  // Circuit Draw
  circuitDrawPlayers: Map<string, CircuitDrawPlayer>;
  circuitDrawReference: { components: any[]; wires: any[] } | null;
  circuitTemplate: { components: unknown[]; wires: unknown[] } | null;
  // Circuit Simulate
  circuitSimulatePlayers: Map<string, CircuitSimulatePlayer>;
  circuitSimulateChallenges: CircuitChallenge[];
  circuitSimulateCurrentChallenge: number;
  circuitSimulateChallengeEndsAt: number;
  circuitSimulatePaused: boolean;
  circuitSimulateRemainingMs: number;
  simulateChallenges: CircuitChallenge[] | null;
}

interface CircuitChallenge {
  id: string;
  title: string;
  description: string;
  starterCircuit: { components: any[]; wires: any[] } | null;
  referenceCircuit?: unknown;
  targetBehavior: string; // e.g., "LED blinks at 1Hz", "Output HIGH when A=1 AND B=1"
  testCases: { inputs: Record<string, number>; expectedOutputs: Record<string, number> }[];
  points: number;
}

const MAX_PLAYERS = 60;

const rooms = new Map<string, RoomState>();
const circuitInspectionSubscriptions = new Map<string, { roomCode: string; userId: string }>();
let ioRef: IOServer | null = null;


function authenticate(socket: Socket): SocketPayload | null {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = getUserById(payload.sub);
    if (!user || user.status === 'locked' || user.must_change_password === 1) return null;
    return { userId: user.id, role: user.role };
  } catch {
    return null;
  }
}

function isRoomHost(room: RoomState | undefined, socket: Socket): room is RoomState {
  return !!room && socket.data.role !== 'student' && room.hostId === String(socket.data.userId);
}

function isEnrolled(classId: string | null, userId: string): boolean {
  if (!classId) return false;
  return !!db.prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?').get(classId, userId);
}

function leaderboard(room: RoomState): { name: string; score: number; team?: string }[] {
  if (room.gameType === 'circuit_simulate') {
    return [...room.circuitSimulatePlayers.values()]
      .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName))
      .slice(0, 15)
      .map((player) => ({ name: player.displayName, score: player.score }));
  }
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


function addKttx(classId: string | null, userId: string, delta: number): number {
  if (!classId || delta === 0 || !isEnrolled(classId, userId)) return 0;
  const row = db.prepare('SELECT kttx FROM grades WHERE class_id = ? AND student_id = ?').get(classId, userId) as
    | { kttx: number | null }
    | undefined;
  const current = row?.kttx ?? 0;
  const next = Math.min(10, Math.round((current + delta) * 100) / 100);
  db.prepare(
    `INSERT INTO grades (class_id, student_id, kttx, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(class_id, student_id) DO UPDATE SET kttx = excluded.kttx, updated_at = excluded.updated_at`
  ).run(classId, userId, next);
  return next;
}

function broadcastHands(room: RoomState): void {
  ioRef?.to(`game:${room.roomCode}`).emit('hr:hands-update', {
    hands: [...room.hands.entries()].map(([userId, name]) => ({ userId, name })),
    picked: room.activePick,
  });
}

function emitCrosswordState(room: RoomState, target?: Socket): void {
  if (!room.puzzle) return;
  const payload = {
    keywordLength: room.puzzle.keyword.length,
    keywordRevealed: [...room.puzzle.keyword].map((ch, i) => (room.solvedRows.has(i) ? ch.toUpperCase() : '_')),
    rows: room.puzzle.rows.map((r, i) => ({
      index: i,
      clue: r.clue,
      wordLen: r.word.length,
      solved: room.solvedRows.has(i),
      word: room.solvedRows.has(i) ? r.word.toUpperCase() : null,
    })),
    solvedCount: room.solvedRows.size,
    total: room.puzzle.rows.length,
  };
  if (target) target.emit('cw:state', payload);
  else ioRef?.to(`game:${room.roomCode}`).emit('cw:state', payload);
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
  if (room.gameType === 'hand_raise') {
    room.hands.clear();
    room.activePick = null;
    broadcastHands(room);
    return;
  }
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
  room.timer = null;

  let podium: { rank: number; name: string; score: number }[] = [];
  const circuitDebrief = room.gameType === 'circuit_simulate' ? buildCircuitLearningDebrief(room) : null;
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
  } else if (room.gameType === 'bingo') {
    podium = [...room.bingoPlayers.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, name: p.displayName, score: p.score }));
  } else if (room.gameType === 'memory_match') {
    podium = [...room.memoryPlayers.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, name: p.displayName, score: p.score }));
  } else if (room.gameType === 'word_scramble') {
    podium = [...room.wordScramblePlayers.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, name: p.displayName, score: p.score }));
  } else if (room.gameType === 'quiz_show') {
    podium = [...room.quizShowPlayers.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, name: p.displayName, score: p.score }));
  } else if (room.gameType === 'circuit_simulate') {
    podium = [...room.circuitSimulatePlayers.values()]
      .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName))
      .map((p, i) => ({ rank: i + 1, name: p.displayName, score: p.score }));
  } else {
    podium = [...room.players.values()]
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ rank: i + 1, name: p.displayName, score: p.score }));
  }

  if (circuitDebrief) {
    ioRef?.to(circuitHostRoom(room)).emit('circuit_simulate:learning_debrief', circuitDebrief);
  }
  ioRef?.to(`game:${room.roomCode}`).emit('game:finished', { podium });

  try {
    const insertResult = db.prepare(
      `INSERT INTO game_results (game_session_id, student_id, score, rank, detail_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(game_session_id, student_id) DO UPDATE SET
         score = excluded.score, rank = excluded.rank, detail_json = excluded.detail_json`
    );
    const nameToPlayer = new Map<string, string>();
    for (const p of room.players.values()) nameToPlayer.set(p.displayName, p.userId);
    for (const r of room.racePlayers.values()) nameToPlayer.set(r.displayName, r.userId);
    for (const b of room.bingoPlayers.values()) nameToPlayer.set(b.displayName, b.userId);
    for (const m of room.memoryPlayers.values()) nameToPlayer.set(m.displayName, m.userId);
    for (const w of room.wordScramblePlayers.values()) nameToPlayer.set(w.displayName, w.userId);
    for (const q of room.quizShowPlayers.values()) nameToPlayer.set(q.displayName, q.userId);
    const circuitResultDetail = (learner: CircuitDebriefRow) => JSON.stringify({
      type: 'circuit_learning_debrief',
      version: 1,
      completedCount: learner.completedCount,
      totalChallenges: learner.totalChallenges,
      totalSubmissionAttempts: learner.totalSubmissionAttempts,
      incorrectSubmissionAttempts: learner.incorrectSubmissionAttempts,
    });

    tx(() => {
      if (circuitDebrief) {
        for (const [index, learner] of circuitDebrief.learners.entries()) {
          insertResult.run(room.sessionId, learner.userId, learner.score, index + 1, circuitResultDetail(learner));
        }
      } else {
        for (const entry of podium) {
          const userId = nameToPlayer.get(entry.name);
          if (userId) insertResult.run(room.sessionId, userId, entry.score, entry.rank, '{}');
        }
      }
      db.prepare("UPDATE game_sessions SET status = 'finished', finished_at = datetime('now') WHERE id = ?").run(room.sessionId);
    });
  } catch (err) {
    console.error('[game] persist results failed', err);
  }
  setTimeout(() => rooms.delete(room.roomCode), 10 * 60_000);
}

// ============ BINGO ============


function initBingo(room: RoomState): void {
  room.phase = 'bingo';
  room.bingoNumbers = Array.from({ length: 75 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
  room.bingoCalled = [];
  room.bingoPlayers = new Map();
  for (const player of room.players.values()) {
    const bingoPlayer = {
      userId: player.userId,
      displayName: player.displayName,
      card: generateBingoCard(),
      marked: Array(5).fill(null).map(() => Array(5).fill(false)),
      lines: 0,
      score: 0,
      bingo: false,
    };
    // Mark free space
    bingoPlayer.marked[2]![2] = true;
    room.bingoPlayers.set(player.userId, bingoPlayer);
  }
  ioRef?.to(`game:${room.roomCode}`).emit('bingo:init', {
    players: [...room.bingoPlayers.values()].map((p) => ({
      userId: p.userId,
      name: p.displayName,
      card: p.card,
    })),
  });
  callNextBingoNumber(room);
}

function callNextBingoNumber(room: RoomState): void {
  if (room.bingoNumbers.length === 0) {
    finishGame(room);
    return;
  }
  const num = room.bingoNumbers.shift()!;
  room.bingoCalled.push(num);
  ioRef?.to(`game:${room.roomCode}`).emit('bingo:call', { number: num, called: room.bingoCalled });
  // Auto-check for bingo after delay
  room.timer = setTimeout(() => checkBingoLinesForPlayers(room), 3000);
}

function checkBingoLinesForPlayers(room: RoomState): void {
  for (const [userId, player] of room.bingoPlayers) {
    if (player.bingo) continue;
    const oldLines = player.lines;
    player.lines = checkBingoLines(player.marked);
    if (player.lines >= 5 && !player.bingo) {
      player.bingo = true;
      player.score += 1000;
      const newKttx = applyCorrectPoints(room, userId, player.displayName);
      ioRef?.to(`game:${room.roomCode}`).emit('bingo:win', {
        userId,
        name: player.displayName,
        lines: player.lines,
        newKttx,
      });
      broadcastLeaderboard(room);
      finishGame(room);
      return;
    } else if (player.lines > oldLines) {
      player.score += (player.lines - oldLines) * 100;
      ioRef?.to(`game:${room.roomCode}`).emit('bingo:lines', {
        userId,
        name: player.displayName,
        lines: player.lines,
      });
    }
  }
  callNextBingoNumber(room);
}

// ============ MEMORY MATCH ============

function initMemoryMatch(room: RoomState): void {
  room.phase = 'memory_match';
  room.memoryCards = generateMemoryCards(12);
  room.memoryPlayers = new Map();
  room.memoryFlipped = [];
  for (const player of room.players.values()) {
    room.memoryPlayers.set(player.userId, {
      userId: player.userId,
      displayName: player.displayName,
      score: 0,
      matches: 0,
      currentFlipped: [],
      lastFlipTime: 0,
    });
  }
  ioRef?.to(`game:${room.roomCode}`).emit('memory:init', {
    cards: room.memoryCards.map((c) => ({ id: c.id, value: c.matched ? c.value : '?', matched: c.matched })),
    players: [...room.memoryPlayers.values()].map((p) => ({
      userId: p.userId,
      name: p.displayName,
      score: p.score,
      matches: p.matches,
    })),
  });
}

function checkMemoryMatch(room: RoomState, userId: string, cardIndex: number): void {
  const player = room.memoryPlayers.get(userId);
  if (!player || player.currentFlipped.length >= 2) return;
  const card = room.memoryCards[cardIndex];
  if (!card || card.matched || player.currentFlipped.includes(cardIndex)) return;

  player.currentFlipped.push(cardIndex);
  player.lastFlipTime = Date.now();

  ioRef?.to(`game:${room.roomCode}`).emit('memory:flip', {
    userId,
    name: player.displayName,
    cardIndex,
    value: card.value,
  });

  if (player.currentFlipped.length === 2) {
    const [idx1, idx2] = player.currentFlipped as [number, number];
    const card1 = room.memoryCards[idx1]!;
    const card2 = room.memoryCards[idx2]!;
    if (card1.value === card2.value) {
      card1.matched = true;
      card2.matched = true;
      player.matches++;
      player.score += 100;
      player.currentFlipped = [];
      ioRef?.to(`game:${room.roomCode}`).emit('memory:match', {
        userId,
        name: player.displayName,
        cardIndices: [idx1, idx2],
        value: card1.value,
      });
      checkMemoryWin(room);
    } else {
      ioRef?.to(`game:${room.roomCode}`).emit('memory:mismatch', {
        userId,
        name: player.displayName,
        cardIndices: [idx1, idx2],
      });
      room.timer = setTimeout(() => {
        const p = room.memoryPlayers.get(userId);
        if (p) p.currentFlipped = [];
        ioRef?.to(`game:${room.roomCode}`).emit('memory:hide', { cardIndices: [idx1, idx2] });
      }, 1500);
    }
  }
}

function checkMemoryWin(room: RoomState): void {
  const allMatched = room.memoryCards.every((c) => c.matched);
  if (allMatched) {
    finishGame(room);
  }
}

// ============ WORD SCRAMBLE ============

function initWordScramble(room: RoomState): void {
  room.phase = 'word_scramble';
  room.wordScrambleWords = room.questions.map((q) => ({
    original: q.correctText || q.content,
    scrambled: scrambleWord(q.correctText || q.content),
  }));
  room.wordScramblePlayers = new Map();
  for (const player of room.players.values()) {
    room.wordScramblePlayers.set(player.userId, {
      userId: player.userId,
      displayName: player.displayName,
      score: 0,
      solved: 0,
      currentWord: null,
      currentScrambled: null,
      attempts: 0,
    });
  }
  sendNextWordScramble(room);
}

function sendNextWordScramble(room: RoomState): void {
  for (const [userId, player] of room.wordScramblePlayers) {
    if (player.solved >= room.wordScrambleWords.length) continue;
    const wordData = room.wordScrambleWords[player.solved]!;
    player.currentWord = wordData.original;
    player.currentScrambled = wordData.scrambled;
    player.attempts = 0;
    const socket = [...ioRef?.sockets.sockets.values() ?? []].find(
      (s) => s.data.userId === userId && s.data.role === 'student'
    );
    if (socket) {
      socket.emit('word_scramble:next', {
        word: wordData.scrambled,
        index: player.solved,
        total: room.wordScrambleWords.length,
      });
    }
  }
  ioRef?.to(`game:${room.roomCode}`).emit('word_scramble:update', {
    players: [...room.wordScramblePlayers.values()].map((p) => ({
      userId: p.userId,
      name: p.displayName,
      score: p.score,
      solved: p.solved,
    })),
  });
}

function checkWordScramble(room: RoomState, userId: string, guess: string): void {
  const player = room.wordScramblePlayers.get(userId);
  if (!player || !player.currentWord) return;
  player.attempts++;
  const normalizedGuess = guess.trim().toLowerCase();
  const normalizedAnswer = player.currentWord.trim().toLowerCase();
  if (normalizedGuess === normalizedAnswer) {
    const points = Math.max(100, 500 - player.attempts * 50);
    player.score += points;
    player.solved++;
    player.currentWord = null;
    player.currentScrambled = null;
    ioRef?.to(`game:${room.roomCode}`).emit('word_scramble:correct', {
      userId,
      name: player.displayName,
      points,
      word: player.currentWord,
    });
    const newKttx = applyCorrectPoints(room, userId, player.displayName);
    ioRef?.to(`game:${room.roomCode}`).emit('word_scramble:kttx', { userId, name: player.displayName, newKttx });
    broadcastLeaderboard(room);
    sendNextWordScramble(room);
  } else {
    ioRef?.to(`game:${room.roomCode}`).emit('word_scramble:wrong', {
      userId,
      name: player.displayName,
      attempts: player.attempts,
    });
  }
  checkWordScrambleWin(room);
}

function checkWordScrambleWin(room: RoomState): void {
  const allDone = [...room.wordScramblePlayers.values()].every(
    (p) => p.solved >= room.wordScrambleWords.length
  );
  if (allDone) finishGame(room);
}

// ============ QUIZ SHOW ============
function initQuizShow(room: RoomState): void {
  room.phase = 'quiz_show';
  room.quizShowQuestions = room.questions;
  room.quizShowPlayers = new Map();
  room.quizShowCurrentQuestion = 0;
  for (const player of room.players.values()) {
    room.quizShowPlayers.set(player.userId, {
      userId: player.userId,
      displayName: player.displayName,
      score: 0,
      streak: 0,
      lifelines: { fiftyFifty: true, askAudience: true, phoneFriend: true },
      currentQuestion: 0,
      answers: new Map(),
    });
  }
  sendQuizShowQuestion(room);
}

// ============ CIRCUIT DRAW ============
function initCircuitDraw(room: RoomState): void {
  room.phase = 'circuit_draw';
  room.circuitDrawPlayers = new Map();
  room.circuitDrawReference = (room.circuitTemplate as { components: any[]; wires: any[] } | null) ?? null;
  for (const player of room.players.values()) {
    room.circuitDrawPlayers.set(player.userId, {
      userId: player.userId,
      displayName: player.displayName,
      score: 0,
      circuit: null,
      submitted: false,
      verified: false,
      feedback: '',
    });
  }
  ioRef?.to(`game:${room.roomCode}`).emit('circuit_draw:init', {
    referenceCircuit: room.circuitDrawReference,
    durationSec: room.secondsPerQuestion,
  });
  // Auto-submit after time
  room.timer = setTimeout(() => {
    submitAllCircuits(room);
  }, room.secondsPerQuestion * 1000);
}

function submitAllCircuits(room: RoomState): void {
  let submitted = 0;
  for (const [userId, player] of room.circuitDrawPlayers) {
    if (!player.submitted && player.circuit) {
      player.submitted = true;
      submitted++;
    }
  }
  ioRef?.to(`game:${room.roomCode}`).emit('circuit_draw:auto_submitted', { submitted });
  // Teacher will verify manually via verdict
}

/* ---------- Auto-verify: so khớp netlist theo CẤP LOẠI LINH KIỆN ----------
   Không so vị trí/xoay — chỉ so:
   1) Đúng số lượng từng loại linh kiện
   2) Đúng số dây nối
   3) Tập "chữ ký kết nối" (loại:chân ~ loại:chân) giống hệt nhau          */
interface TypeLevelNetlist {
  types: Map<string, number>;
  sigs: Map<string, number>;
  wireCount: number;
}

function extractNetlist(circuit: unknown): TypeLevelNetlist | null {
  const obj = circuit as { components?: any[]; wires?: any[] } | null | undefined;
  if (!obj || !Array.isArray(obj.components) || !Array.isArray(obj.wires)) return null;

  const idType = new Map<string, string>();
  const types = new Map<string, number>();
  for (const comp of obj.components) {
    if (!comp || typeof comp.id !== 'string' || typeof comp.type !== 'string') return null;
    idType.set(comp.id, comp.type);
    types.set(comp.type, (types.get(comp.type) ?? 0) + 1);
  }

  const sigs = new Map<string, number>();
  let wireCount = 0;
  const epOf = (raw: unknown, explicitPort: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const sep = raw.lastIndexOf('::');
    const cid = sep >= 0 ? raw.slice(0, sep) : raw;
    const embeddedPort = sep >= 0 ? raw.slice(sep + 2) : '';
    const pid = embeddedPort || (typeof explicitPort === 'string' ? explicitPort : '');
    const t = idType.get(cid);
    if (!t) return null;
    return `${t}:${pid || '?'}`;
  };

  for (const w of obj.wires) {
    if (!w || typeof w.from !== 'string' || typeof w.to !== 'string') continue;
    const a = epOf(w.from, w.fromPort);
    const b = epOf(w.to, w.toPort);
    if (!a || !b || a === b) continue;
    wireCount++;
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}~${y}`;
    sigs.set(key, (sigs.get(key) ?? 0) + 1);
  }

  return { types, sigs, wireCount };
}

function circuitsMatch(student: unknown, reference: unknown): boolean {
  const s = extractNetlist(student);
  const r = extractNetlist(reference);
  if (!s || !r) return false;
  if (s.wireCount !== r.wireCount) return false;
  if (s.types.size !== r.types.size) return false;
  for (const [t, n] of r.types) {
    if (s.types.get(t) !== n) return false;
  }
  if (s.sigs.size !== r.sigs.size) return false;
  for (const [k, n] of r.sigs) {
    if (s.sigs.get(k) !== n) return false;
  }
  return true;
}

function buildCircuitLearningDebrief(room: RoomState): CircuitLearningDebrief {
  const totalChallenges = room.circuitSimulateChallenges.length;
  const learners = [...room.circuitSimulatePlayers.values()]
    .map((player): CircuitDebriefRow => ({
      userId: player.userId,
      name: player.displayName,
      completedCount: player.completedChallenges.length,
      totalChallenges,
      totalSubmissionAttempts: player.totalSubmissionAttempts,
      incorrectSubmissionAttempts: player.incorrectSubmissionAttempts,
      score: player.score,
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  const totalCompletions = learners.reduce((sum, learner) => sum + learner.completedCount, 0);
  const totalPossible = learners.length * totalChallenges;
  return {
    summary: {
      learnerCount: learners.length,
      completedAllCount: learners.filter((learner) => totalChallenges > 0 && learner.completedCount === totalChallenges).length,
      totalCompletions,
      totalPossible,
      totalSubmissionAttempts: learners.reduce((sum, learner) => sum + learner.totalSubmissionAttempts, 0),
      incorrectSubmissionAttempts: learners.reduce((sum, learner) => sum + learner.incorrectSubmissionAttempts, 0),
      completionRate: totalPossible > 0 ? Math.round((totalCompletions / totalPossible) * 100) : 0,
    },
    learners,
  };
}

function circuitHostRoom(room: RoomState): string {
  return `game-host:${room.sessionId}`;
}

function circuitSimulateProgressRow(room: RoomState, player: CircuitSimulatePlayer) {
  const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
  const currentCircuit = challenge && player.circuitChallengeId === challenge.id ? player.circuit : null;
  const componentCount = currentCircuit?.components.length ?? 0;
  const wireCount = currentCircuit?.wires.length ?? 0;
  const online = room.players.get(player.userId)?.online ?? false;
  const completedCurrent = !!challenge && player.completedChallenges.includes(challenge.id);
  const status = !online
    ? 'disconnected'
    : completedCurrent
      ? 'completed'
      : componentCount > 0 || wireCount > 0 || player.simulationState !== 'idle'
        ? 'working'
        : 'not_started';
  return {
    userId: player.userId,
    name: player.displayName,
    online,
    status,
    completedCurrent,
    completedCount: player.completedChallenges.length,
    totalChallenges: room.circuitSimulateChallenges.length,
    score: player.score,
    simulationState: player.simulationState,
    componentCount,
    wireCount,
    lastActivityAt: player.lastActivityAt,
    submissionAttempts: player.submissionAttempts,
    totalSubmissionAttempts: player.totalSubmissionAttempts,
    incorrectSubmissionAttempts: player.incorrectSubmissionAttempts,
    lastSubmissionAt: player.lastSubmissionAt,
    lastValidationCode: player.lastValidationCode,
    lastValidationFeedback: player.lastValidationFeedback,
  };
}

function circuitSimulateProgressSnapshot(room: RoomState) {
  return [...room.circuitSimulatePlayers.values()]
    .map((player) => circuitSimulateProgressRow(room, player))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function circuitSimulateInspection(room: RoomState, player: CircuitSimulatePlayer) {
  const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
  return {
    ...circuitSimulateProgressRow(room, player),
    challengeId: challenge?.id ?? null,
    circuit: challenge && player.circuitChallengeId === challenge.id ? player.circuit : null,
  };
}

function emitCircuitSimulateProgress(room: RoomState, player: CircuitSimulatePlayer): void {
  ioRef?.to(circuitHostRoom(room)).emit(
    'circuit_simulate:progress',
    circuitSimulateProgressRow(room, player),
  );
}

function emitCircuitSimulateProgressSnapshot(room: RoomState): void {
  ioRef?.to(circuitHostRoom(room)).emit(
    'circuit_simulate:progress_snapshot',
    { rows: circuitSimulateProgressSnapshot(room) },
  );
}

function emitCircuitSimulateInspectionUpdate(room: RoomState, player: CircuitSimulatePlayer): void {
  if (!ioRef) return;
  const payload = circuitSimulateInspection(room, player);
  for (const [socketId, subscription] of circuitInspectionSubscriptions) {
    if (subscription.roomCode !== room.roomCode || subscription.userId !== player.userId) continue;
    ioRef.sockets.sockets.get(socketId)?.emit('circuit_simulate:inspection_update', payload);
  }
}

interface CircuitAssistanceRow {
  game_session_id: string;
  student_id: string;
  message_id: string;
  kind: 'hint' | 'retry';
  message: string;
  teacher_name: string;
  sent_at: number;
  delivered_at: number | null;
  acknowledged_at: number | null;
}

type CircuitAssistanceStatus = 'queued' | 'delivered' | 'acknowledged';

function circuitAssistanceStatus(row: CircuitAssistanceRow): CircuitAssistanceStatus {
  if (row.acknowledged_at !== null) return 'acknowledged';
  if (row.delivered_at !== null) return 'delivered';
  return 'queued';
}

function circuitAssistancePayload(row: CircuitAssistanceRow) {
  return {
    messageId: row.message_id,
    kind: row.kind,
    message: row.message,
    teacherName: row.teacher_name,
    sentAt: row.sent_at,
  };
}

function circuitAssistanceStatusPayload(room: RoomState, row: CircuitAssistanceRow) {
  const player = room.circuitSimulatePlayers.get(row.student_id);
  return {
    userId: row.student_id,
    name: player?.displayName ?? 'Học viên',
    messageId: row.message_id,
    kind: row.kind,
    message: row.message,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    acknowledgedAt: row.acknowledged_at,
    status: circuitAssistanceStatus(row),
  };
}

function getCircuitAssistance(sessionId: string, userId: string): CircuitAssistanceRow | undefined {
  return db.prepare(`
    SELECT game_session_id, student_id, message_id, kind, message, teacher_name,
           sent_at, delivered_at, acknowledged_at
    FROM game_circuit_assistance
    WHERE game_session_id = ? AND student_id = ?
  `).get(sessionId, userId) as CircuitAssistanceRow | undefined;
}

function circuitAssistanceSnapshot(room: RoomState) {
  const rows = db.prepare(`
    SELECT game_session_id, student_id, message_id, kind, message, teacher_name,
           sent_at, delivered_at, acknowledged_at
    FROM game_circuit_assistance
    WHERE game_session_id = ?
    ORDER BY sent_at DESC, student_id
  `).all(room.sessionId) as unknown as CircuitAssistanceRow[];
  return rows.map((row) => circuitAssistanceStatusPayload(room, row));
}

function markCircuitAssistanceDelivered(room: RoomState, row: CircuitAssistanceRow, deliveredAt: number): CircuitAssistanceRow {
  db.prepare(`
    UPDATE game_circuit_assistance
    SET delivered_at = COALESCE(delivered_at, ?), updated_at = datetime('now')
    WHERE game_session_id = ? AND student_id = ? AND message_id = ? AND acknowledged_at IS NULL
  `).run(deliveredAt, room.sessionId, row.student_id, row.message_id);
  return getCircuitAssistance(room.sessionId, row.student_id) ?? row;
}

function emitCircuitAssistanceStatus(room: RoomState, row: CircuitAssistanceRow): void {
  ioRef?.to(circuitHostRoom(room)).emit(
    'circuit_simulate:teacher-message-status',
    circuitAssistanceStatusPayload(room, row),
  );
}

function deliverPendingCircuitAssistance(room: RoomState, socket: Socket, userId: string): void {
  const row = getCircuitAssistance(room.sessionId, userId);
  if (!row || row.acknowledged_at !== null) return;
  if (socket.data.circuitAssistanceMessageId === row.message_id) return;
  socket.data.circuitAssistanceMessageId = row.message_id;
  socket.emit('circuit_simulate:teacher-message', circuitAssistancePayload(row));
  const delivered = markCircuitAssistanceDelivered(room, row, Date.now());
  emitCircuitAssistanceStatus(room, delivered);
}

function circuitSimulateHostSnapshot(room: RoomState) {
  if (room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return null;
  const activeChallenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
  if (!activeChallenge) return null;
  const challengeById = new Map(
    room.circuitSimulateChallenges.map((challenge, index) => [challenge.id, { challenge, index }] as const),
  );
  const passes = [...room.circuitSimulatePlayers.values()]
    .flatMap((player) => player.completedChallenges.flatMap((challengeId) => {
      const matched = challengeById.get(challengeId);
      return matched ? [{
        userId: player.userId,
        name: player.displayName,
        challengeId,
        points: matched.challenge.points,
        challengeIndex: matched.index,
      }] : [];
    }))
    .sort((a, b) => b.challengeIndex - a.challengeIndex || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((pass) => ({
      userId: pass.userId,
      name: pass.name,
      challengeId: pass.challengeId,
      points: pass.points,
    }));

  return {
    challenge: {
      index: room.circuitSimulateCurrentChallenge,
      total: room.circuitSimulateChallenges.length,
      endsAt: room.circuitSimulateChallengeEndsAt,
      paused: room.circuitSimulatePaused,
      remainingMs: room.circuitSimulatePaused
        ? room.circuitSimulateRemainingMs
        : Math.max(0, room.circuitSimulateChallengeEndsAt - Date.now()),
      title: activeChallenge.title,
      description: activeChallenge.description,
      targetBehavior: activeChallenge.targetBehavior,
    },
    passes,
    progress: circuitSimulateProgressSnapshot(room),
    assistance: circuitAssistanceSnapshot(room),
  };
}

function circuitValidationResult(student: unknown, reference: unknown): {
  correct: boolean;
  code: CircuitValidationCode;
  feedback: string;
} {
  const s = extractNetlist(student);
  const r = extractNetlist(reference);
  if (!s || !r) return { correct: false, code: 'invalid_data', feedback: 'Dữ liệu mạch không hợp lệ. Hãy thử nộp lại.' };
  if (circuitsMatch(student, reference)) return { correct: true, code: 'correct', feedback: 'Mạch đúng — kết quả đã được ghi nhận.' };
  if (s.wireCount !== r.wireCount) {
    return { correct: false, code: 'wire_count', feedback: `Cần kiểm tra số dây nối (${s.wireCount}/${r.wireCount}).` };
  }
  for (const [type, count] of r.types) {
    if (s.types.get(type) !== count) {
      return { correct: false, code: 'component_count', feedback: 'Cần kiểm tra lại loại và số lượng linh kiện.' };
    }
  }
  return { correct: false, code: 'connection', feedback: 'Các chân nối chưa đúng. Hãy kiểm tra chiều OUT → IN.' };
}

interface CircuitRuntimeRow {
  challenge_index: number;
  challenge_ends_at: number;
  is_paused: number;
  remaining_ms: number;
}

interface CircuitPlayerStateRow {
  student_id: string;
  display_name: string;
  score: number;
  circuit_json: string | null;
  circuit_challenge_id: string | null;
  simulation_state: CircuitSimulatePlayer['simulationState'];
  measurements_json: string;
  completed_challenges_json: string;
  last_activity_at: number;
  submission_attempts: number;
  last_submission_at: number | null;
  last_validation_code: CircuitValidationCode | null;
  last_validation_feedback: string | null;
  total_submission_attempts: number;
  incorrect_submission_attempts: number;
}

function createCircuitPersistenceStatements() {
  return {
    upsertRuntime: db.prepare(`
      INSERT INTO game_circuit_runtime (
        game_session_id, challenge_index, challenge_ends_at, is_paused, remaining_ms, updated_at
      ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(game_session_id) DO UPDATE SET
        challenge_index = excluded.challenge_index,
        challenge_ends_at = excluded.challenge_ends_at,
        is_paused = excluded.is_paused,
        remaining_ms = excluded.remaining_ms,
        updated_at = datetime('now')
    `),
    upsertPlayer: db.prepare(`
      INSERT INTO game_circuit_player_states (
        game_session_id, student_id, display_name, score, circuit_json, circuit_challenge_id,
        simulation_state, measurements_json, completed_challenges_json, last_activity_at,
        submission_attempts, last_submission_at, last_validation_code, last_validation_feedback,
        total_submission_attempts, incorrect_submission_attempts, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(game_session_id, student_id) DO UPDATE SET
        display_name = excluded.display_name,
        score = excluded.score,
        circuit_json = excluded.circuit_json,
        circuit_challenge_id = excluded.circuit_challenge_id,
        simulation_state = excluded.simulation_state,
        measurements_json = excluded.measurements_json,
        completed_challenges_json = excluded.completed_challenges_json,
        last_activity_at = excluded.last_activity_at,
        submission_attempts = excluded.submission_attempts,
        last_submission_at = excluded.last_submission_at,
        last_validation_code = excluded.last_validation_code,
        last_validation_feedback = excluded.last_validation_feedback,
        total_submission_attempts = excluded.total_submission_attempts,
        incorrect_submission_attempts = excluded.incorrect_submission_attempts,
        updated_at = datetime('now')
    `),
  };
}

let circuitPersistenceStatements: ReturnType<typeof createCircuitPersistenceStatements> | null = null;

function getCircuitPersistenceStatements() {
  circuitPersistenceStatements ??= createCircuitPersistenceStatements();
  return circuitPersistenceStatements;
}

function persistCircuitRuntime(room: RoomState): void {
  getCircuitPersistenceStatements().upsertRuntime.run(
    room.sessionId,
    room.circuitSimulateCurrentChallenge,
    room.circuitSimulateChallengeEndsAt,
    room.circuitSimulatePaused ? 1 : 0,
    Math.max(0, Math.trunc(room.circuitSimulateRemainingMs)),
  );
}

function persistCircuitPlayer(room: RoomState, player: CircuitSimulatePlayer): void {
  getCircuitPersistenceStatements().upsertPlayer.run(
    room.sessionId,
    player.userId,
    player.displayName,
    player.score,
    player.circuit ? JSON.stringify(player.circuit) : null,
    player.circuitChallengeId,
    player.simulationState,
    JSON.stringify(player.measurements),
    JSON.stringify(player.completedChallenges),
    Math.max(0, Math.trunc(player.lastActivityAt)),
    Math.max(0, Math.trunc(player.submissionAttempts)),
    player.lastSubmissionAt === null ? null : Math.max(0, Math.trunc(player.lastSubmissionAt)),
    player.lastValidationCode,
    player.lastValidationFeedback,
    Math.max(0, Math.trunc(player.totalSubmissionAttempts)),
    Math.max(0, Math.trunc(player.incorrectSubmissionAttempts)),
  );
}

function persistCircuitRoom(room: RoomState): void {
  tx(() => {
    persistCircuitRuntime(room);
    for (const player of room.circuitSimulatePlayers.values()) persistCircuitPlayer(room, player);
  });
}

function completeCircuitChallenge(
  room: RoomState,
  player: CircuitSimulatePlayer,
  challenge: CircuitChallenge,
): number | null {
  if (player.completedChallenges.includes(challenge.id)) return null;
  const genericPlayer = room.players.get(player.userId);
  const previousCircuitScore = player.score;
  const previousGenericScore = genericPlayer?.score ?? 0;
  player.completedChallenges.push(challenge.id);
  player.score += challenge.points;
  try {
    let newKttx = 0;
    tx(() => {
      newKttx = applyCorrectPoints(room, player.userId, player.displayName);
      persistCircuitPlayer(room, player);
    });
    return newKttx;
  } catch (error) {
    player.completedChallenges = player.completedChallenges.filter((challengeId) => challengeId !== challenge.id);
    player.score = previousCircuitScore;
    if (genericPlayer) genericPlayer.score = previousGenericScore;
    throw error;
  }
}

function parsePersistedJson(raw: string | null, fallback: unknown): unknown {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}

// ============ CIRCUIT SIMULATE ============
/* Bộ thử thách mặc định dạng SỐ — chấm tự động bằng circuitsMatch (topology) */
function buildDigitalDefaults(): CircuitChallenge[] {
  let n = 0;
  interface DPart { id: string; type: string; x: number; y: number; rot: number; props: Record<string, unknown> }
  const C = (type: string, x: number, y: number, props: Record<string, unknown> = {}): DPart =>
    ({ id: `dc${n++}`, type, x, y, rot: 0, props });
  const W = (a: { id: string }, ap: string, b: { id: string }, bp: string): Record<string, unknown> =>
    ({ id: `dw${n++}`, from: `${a.id}::${ap}`, to: `${b.id}::${bp}` });

  /* 1 — Đèn LED + công tắc */
  const v1 = C('vcc', 180, 140);
  const s1 = C('switch', 320, 140, { on: false });
  const l1 = C('led', 460, 140, { color: '#ef4444' });
  const g1 = C('gnd', 460, 260);
  const ch1: CircuitChallenge = {
    id: 'digital_1',
    title: 'Đóng mạch đèn LED',
    description: 'Nối nguồn VCC qua công tắc tới đèn LED rồi xuống GND.',
    targetBehavior: 'Bật công tắc → LED sáng',
    starterCircuit: null,
    referenceCircuit: {
      components: [v1, s1, l1, g1],
      wires: [W(v1, 'out', s1, 'in'), W(s1, 'out', l1, 'anode'), W(l1, 'cathode', g1, 'out')],
    },
    testCases: [],
    points: 100,
  };

  /* 2 — Cổng AND điều khiển đèn */
  const v2 = C('vcc', 140, 160);
  const sa = C('switch', 280, 90, { on: false });
  const sb = C('switch', 280, 230, { on: false });
  const an = C('and', 430, 160);
  const l2 = C('led', 570, 160, { color: '#22c55e' });
  const g2 = C('gnd', 570, 280);
  const ch2: CircuitChallenge = {
    id: 'digital_2',
    title: 'Cổng AND — hai chìa khoá',
    description: 'Dựng mạch chỉ khi BẬT cả hai công tắc thì đèn mới sáng.',
    targetBehavior: 'Cả hai công tắc ON → LED sáng; thiếu một → tắt',
    starterCircuit: null,
    referenceCircuit: {
      components: [v2, sa, sb, an, l2, g2],
      wires: [
        W(v2, 'out', sa, 'in'), W(v2, 'out', sb, 'in'),
        W(sa, 'out', an, 'a'), W(sb, 'out', an, 'b'),
        W(an, 'y', l2, 'anode'), W(l2, 'cathode', g2, 'out'),
      ],
    },
    testCases: [],
    points: 150,
  };

  /* 3 — Mạch đảo NOT */
  const v3 = C('vcc', 180, 150);
  const s3 = C('switch', 320, 150, { on: true });
  const nt = C('not', 450, 150);
  const l3 = C('led', 580, 150, { color: '#3b82f6' });
  const g3 = C('gnd', 580, 270);
  const ch3: CircuitChallenge = {
    id: 'digital_3',
    title: 'Mạch đảo NOT',
    description: 'LED phải sáng khi công tắc đang TẮT và ngừng sáng khi bật.',
    targetBehavior: 'Tắt công tắc → LED sáng · Bật công tắc → LED tắt',
    starterCircuit: { components: [v3, s3, nt, l3, g3], wires: [] },
    referenceCircuit: {
      components: [v3, s3, nt, l3, g3],
      wires: [
        W(v3, 'out', s3, 'in'), W(s3, 'out', nt, 'a'),
        W(nt, 'y', l3, 'anode'), W(l3, 'cathode', g3, 'out'),
      ],
    },
    testCases: [],
    points: 150,
  };

  /* 4 — D Flip-Flop + clock + probe */
  const data = C('switch', 180, 110, { on: false });
  const clock = C('clock', 180, 230, { freqHz: 1 });
  const dff = C('dff', 390, 160);
  const led = C('led', 570, 120, { color: '#a855f7' });
  const probe = C('probe', 570, 230);
  const ground = C('gnd', 570, 320);
  const ch4: CircuitChallenge = {
    id: 'digital_4',
    title: 'D Flip-Flop — chốt dữ liệu theo xung clock',
    description: 'Nối DATA vào D và CLOCK vào CLK. Quan sát Q trên LED và Probe/Oscilloscope; Q chỉ đổi ở cạnh lên của clock.',
    targetBehavior: 'Q chốt giá trị DATA tại cạnh lên CLK và giữ nguyên giữa hai xung',
    starterCircuit: { components: [data, clock, dff, led, probe, ground], wires: [] },
    referenceCircuit: {
      components: [data, clock, dff, led, probe, ground],
      wires: [
        W(data, 'out', dff, 'd'), W(clock, 'out', dff, 'clk'),
        W(dff, 'q', led, 'anode'), W(dff, 'q', probe, 'in'),
        W(led, 'cathode', ground, 'out'),
      ],
    },
    testCases: [],
    points: 200,
  };

  /* 5 — Half Adder: sum and carry */
  const haA = C('switch', 140, 110, { on: false });
  const haB = C('switch', 140, 230, { on: false });
  const halfAdder = C('half_adder', 360, 170);
  const haSumLed = C('led', 570, 110, { color: '#2563eb' });
  const haCarryLed = C('led', 570, 230, { color: '#f97316' });
  const haSumProbe = C('probe', 720, 110);
  const haCarryProbe = C('probe', 720, 230);
  const haSumGround = C('gnd', 570, 310);
  const haCarryGround = C('gnd', 650, 350);
  const ch5: CircuitChallenge = {
    id: 'digital_5',
    title: 'Half Adder — tổng S và bit nhớ C',
    description: 'Nối hai đầu vào A/B vào Half Adder. Quan sát S và C đồng thời bằng LED và Probe/Oscilloscope.',
    targetBehavior: 'S = A XOR B; C = A AND B',
    starterCircuit: { components: [haA, haB, halfAdder, haSumLed, haCarryLed, haSumProbe, haCarryProbe, haSumGround, haCarryGround], wires: [] },
    referenceCircuit: {
      components: [haA, haB, halfAdder, haSumLed, haCarryLed, haSumProbe, haCarryProbe, haSumGround, haCarryGround],
      wires: [
        W(haA, 'out', halfAdder, 'a'), W(haB, 'out', halfAdder, 'b'),
        W(halfAdder, 'sum', haSumLed, 'anode'), W(halfAdder, 'sum', haSumProbe, 'in'),
        W(halfAdder, 'carry', haCarryLed, 'anode'), W(halfAdder, 'carry', haCarryProbe, 'in'),
        W(haSumLed, 'cathode', haSumGround, 'out'), W(haCarryLed, 'cathode', haCarryGround, 'out'),
      ],
    },
    testCases: [],
    points: 200,
  };

  /* 6 — Full Adder: A + B + carry in */
  const faA = C('switch', 120, 90, { on: false });
  const faB = C('switch', 120, 170, { on: false });
  const faCin = C('switch', 120, 250, { on: false });
  const fullAdder = C('full_adder', 360, 170);
  const faSumLed = C('led', 570, 110, { color: '#16a34a' });
  const faCarryLed = C('led', 570, 230, { color: '#e11d48' });
  const faSumProbe = C('probe', 720, 110);
  const faCarryProbe = C('probe', 720, 230);
  const faSumGround = C('gnd', 570, 310);
  const faCarryGround = C('gnd', 650, 350);
  const ch6: CircuitChallenge = {
    id: 'digital_6',
    title: 'Full Adder — cộng A, B và Cin',
    description: 'Hoàn thiện mạch Full Adder ba đầu vào. Dùng LED và Probe để đối chiếu bit tổng S cùng bit nhớ Cout.',
    targetBehavior: 'S là parity của A/B/Cin; Cout HIGH khi có ít nhất hai đầu vào HIGH',
    starterCircuit: { components: [faA, faB, faCin, fullAdder, faSumLed, faCarryLed, faSumProbe, faCarryProbe, faSumGround, faCarryGround], wires: [] },
    referenceCircuit: {
      components: [faA, faB, faCin, fullAdder, faSumLed, faCarryLed, faSumProbe, faCarryProbe, faSumGround, faCarryGround],
      wires: [
        W(faA, 'out', fullAdder, 'a'), W(faB, 'out', fullAdder, 'b'), W(faCin, 'out', fullAdder, 'cin'),
        W(fullAdder, 'sum', faSumLed, 'anode'), W(fullAdder, 'sum', faSumProbe, 'in'),
        W(fullAdder, 'cout', faCarryLed, 'anode'), W(fullAdder, 'cout', faCarryProbe, 'in'),
        W(faSumLed, 'cathode', faSumGround, 'out'), W(faCarryLed, 'cathode', faCarryGround, 'out'),
      ],
    },
    testCases: [],
    points: 250,
  };

  return [ch1, ch2, ch3, ch4, ch5, ch6];
}

function configureCircuitSimulateChallenges(room: RoomState): void {
  const starter = (room.circuitTemplate as { components: any[]; wires: any[] } | null) ?? null;
  const custom = room.simulateChallenges && room.simulateChallenges.length > 0 ? room.simulateChallenges : null;
  room.circuitSimulateChallenges = custom
    ? custom.map((challenge) => ({ ...challenge }))
    : buildDigitalDefaults();
  if (!custom && starter && room.circuitSimulateChallenges[0]) {
    room.circuitSimulateChallenges[0].starterCircuit = starter;
  }
}

function initCircuitSimulate(room: RoomState): void {
  room.phase = 'circuit_simulate';
  room.circuitSimulatePlayers = new Map();
  configureCircuitSimulateChallenges(room);
  room.circuitSimulateCurrentChallenge = 0;
  room.circuitSimulatePaused = false;
  room.circuitSimulateRemainingMs = 0;
  for (const player of room.players.values()) {
    room.circuitSimulatePlayers.set(player.userId, {
      userId: player.userId,
      displayName: player.displayName,
      score: 0,
      circuit: null,
      circuitChallengeId: room.circuitSimulateChallenges[0]?.id ?? null,
      simulationState: 'idle',
      measurements: {},
      completedChallenges: [],
      lastActivityAt: Date.now(),
      submissionAttempts: 0,
      lastSubmissionAt: null,
      lastValidationCode: null,
      lastValidationFeedback: null,
      totalSubmissionAttempts: 0,
      incorrectSubmissionAttempts: 0,
    });
  }
  sendCircuitSimulateChallenge(room);
}

function clearCircuitSimulateTimer(room: RoomState): void {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}

function circuitSimulateChallengePayload(room: RoomState) {
  const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
  if (!challenge) return null;
  return {
    index: room.circuitSimulateCurrentChallenge,
    total: room.circuitSimulateChallenges.length,
    endsAt: room.circuitSimulateChallengeEndsAt,
    paused: room.circuitSimulatePaused,
    remainingMs: room.circuitSimulatePaused
      ? room.circuitSimulateRemainingMs
      : Math.max(0, room.circuitSimulateChallengeEndsAt - Date.now()),
    challenge: {
      id: challenge.id,
      title: challenge.title,
      description: challenge.description,
      starterCircuit: challenge.starterCircuit,
      targetBehavior: challenge.targetBehavior,
    },
  };
}

function emitCircuitSimulateControlState(room: RoomState): void {
  ioRef?.to(`game:${room.roomCode}`).emit('circuit_simulate:control_state', {
    index: room.circuitSimulateCurrentChallenge,
    paused: room.circuitSimulatePaused,
    remainingMs: room.circuitSimulatePaused
      ? room.circuitSimulateRemainingMs
      : Math.max(0, room.circuitSimulateChallengeEndsAt - Date.now()),
    endsAt: room.circuitSimulateChallengeEndsAt,
  });
}

function scheduleCircuitSimulateTimer(room: RoomState): void {
  clearCircuitSimulateTimer(room);
  if (room.circuitSimulatePaused) return;
  room.timer = setTimeout(() => {
    room.timer = null;
    if (room.circuitSimulatePaused || room.phase !== 'circuit_simulate') return;
    evaluateCircuitSimulateChallenge(room);
  }, Math.max(0, room.circuitSimulateChallengeEndsAt - Date.now()));
}

function sendCircuitSimulateChallenge(
  room: RoomState,
  challengeEndsAt = Date.now() + room.secondsPerQuestion * 1000,
  resetCurrentChallenge = false,
): void {
  if (room.circuitSimulateCurrentChallenge >= room.circuitSimulateChallenges.length) {
    finishGame(room);
    return;
  }
  const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
  if (!challenge) return;
  const resetAt = Date.now();
  for (const player of room.circuitSimulatePlayers.values()) {
    if (!resetCurrentChallenge && player.circuitChallengeId === challenge.id) continue;
    player.circuit = null;
    player.circuitChallengeId = challenge.id;
    player.measurements = {};
    player.simulationState = 'idle';
    player.lastActivityAt = resetAt;
    player.submissionAttempts = 0;
    player.lastSubmissionAt = null;
    player.lastValidationCode = null;
    player.lastValidationFeedback = null;
  }
  room.circuitSimulatePaused = false;
  room.circuitSimulateRemainingMs = 0;
  room.circuitSimulateChallengeEndsAt = challengeEndsAt;
  persistCircuitRoom(room);
  const payload = circuitSimulateChallengePayload(room);
  if (payload) ioRef?.to(`game:${room.roomCode}`).emit('circuit_simulate:challenge', payload);
  emitCircuitSimulateProgressSnapshot(room);
  for (const player of room.circuitSimulatePlayers.values()) {
    emitCircuitSimulateInspectionUpdate(room, player);
  }
  scheduleCircuitSimulateTimer(room);
}

function restoreCircuitSimulateRoom(room: RoomState): boolean {
  const runtime = db.prepare(
    `SELECT challenge_index, challenge_ends_at, is_paused, remaining_ms
     FROM game_circuit_runtime WHERE game_session_id = ?`,
  ).get(room.sessionId) as CircuitRuntimeRow | undefined;
  if (!runtime) return false;

  configureCircuitSimulateChallenges(room);
  if (room.circuitSimulateChallenges.length === 0) return false;
  room.phase = 'circuit_simulate';
  room.circuitSimulateCurrentChallenge = Math.min(
    Math.max(Math.trunc(runtime.challenge_index), 0),
    room.circuitSimulateChallenges.length - 1,
  );
  room.circuitSimulateChallengeEndsAt = Number.isFinite(runtime.challenge_ends_at) && runtime.challenge_ends_at > 0
    ? runtime.challenge_ends_at
    : Date.now() + room.secondsPerQuestion * 1000;
  room.circuitSimulatePaused = runtime.is_paused === 1;
  room.circuitSimulateRemainingMs = room.circuitSimulatePaused && Number.isFinite(runtime.remaining_ms)
    ? Math.max(0, Math.trunc(runtime.remaining_ms))
    : 0;

  const validChallengeIds = new Set(room.circuitSimulateChallenges.map((challenge) => challenge.id));
  const rows = db.prepare(`
    SELECT student_id, display_name, score, circuit_json, circuit_challenge_id, simulation_state,
           measurements_json, completed_challenges_json, last_activity_at, submission_attempts,
           last_submission_at, last_validation_code, last_validation_feedback,
           total_submission_attempts, incorrect_submission_attempts
    FROM game_circuit_player_states
    WHERE game_session_id = ?
    ORDER BY updated_at, student_id
  `).all(room.sessionId) as unknown as CircuitPlayerStateRow[];

  room.players = new Map();
  room.circuitSimulatePlayers = new Map();
  for (const row of rows) {
    const circuitResult = zCircuitDraw.safeParse(parsePersistedJson(row.circuit_json, null));
    const measurementsResult = z.record(z.string(), z.number()).safeParse(
      parsePersistedJson(row.measurements_json, {}),
    );
    const completedResult = z.array(z.string().max(120)).max(50).safeParse(
      parsePersistedJson(row.completed_challenges_json, []),
    );
    const completedChallenges = completedResult.success
      ? completedResult.data.filter((challengeId) => validChallengeIds.has(challengeId))
      : [];
    const player: CircuitSimulatePlayer = {
      userId: row.student_id,
      displayName: row.display_name,
      score: Number.isFinite(row.score) ? row.score : 0,
      circuit: circuitResult.success ? circuitResult.data : null,
      circuitChallengeId: row.circuit_challenge_id && validChallengeIds.has(row.circuit_challenge_id)
        ? row.circuit_challenge_id
        : null,
      simulationState: row.simulation_state,
      measurements: measurementsResult.success ? measurementsResult.data : {},
      completedChallenges,
      lastActivityAt: Number.isFinite(row.last_activity_at) && row.last_activity_at > 0
        ? row.last_activity_at
        : Date.now(),
      submissionAttempts: Number.isFinite(row.submission_attempts) && row.submission_attempts > 0
        ? Math.trunc(row.submission_attempts)
        : 0,
      lastSubmissionAt: row.last_submission_at !== null && Number.isFinite(row.last_submission_at)
        ? Math.max(0, Math.trunc(row.last_submission_at))
        : null,
      lastValidationCode: row.last_validation_code,
      lastValidationFeedback: row.last_validation_feedback,
      totalSubmissionAttempts: Number.isFinite(row.total_submission_attempts) && row.total_submission_attempts > 0
        ? Math.trunc(row.total_submission_attempts)
        : 0,
      incorrectSubmissionAttempts: Number.isFinite(row.incorrect_submission_attempts) && row.incorrect_submission_attempts > 0
        ? Math.trunc(row.incorrect_submission_attempts)
        : 0,
    };
    room.circuitSimulatePlayers.set(player.userId, player);
    room.players.set(player.userId, {
      userId: player.userId,
      displayName: player.displayName,
      score: completedChallenges.length * room.pointsPerCorrect,
      answers: new Map(),
      online: false,
    });
  }

  const currentChallenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
  if (currentChallenge) {
    const resetAt = Date.now();
    for (const player of room.circuitSimulatePlayers.values()) {
      if (player.circuitChallengeId === currentChallenge.id) continue;
      player.circuit = null;
      player.circuitChallengeId = currentChallenge.id;
      player.measurements = {};
      player.simulationState = 'idle';
      player.lastActivityAt = resetAt;
      player.submissionAttempts = 0;
      player.lastSubmissionAt = null;
      player.lastValidationCode = null;
      player.lastValidationFeedback = null;
    }
  }
  if (room.circuitSimulatePaused) clearCircuitSimulateTimer(room);
  else scheduleCircuitSimulateTimer(room);
  return true;
}

function syncCircuitSimulateLearner(room: RoomState, socket: Socket, userId: string, displayName: string): void {
  if (room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
  const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
  if (!challenge) return;
  let player = room.circuitSimulatePlayers.get(userId);
  if (!player) {
    player = {
      userId,
      displayName,
      score: 0,
      circuit: null,
      circuitChallengeId: challenge.id,
      simulationState: 'idle',
      measurements: {},
      completedChallenges: [],
      lastActivityAt: Date.now(),
      submissionAttempts: 0,
      lastSubmissionAt: null,
      lastValidationCode: null,
      lastValidationFeedback: null,
      totalSubmissionAttempts: 0,
      incorrectSubmissionAttempts: 0,
    };
    room.circuitSimulatePlayers.set(userId, player);
    persistCircuitPlayer(room, player);
  }
  const circuit = player.circuitChallengeId === challenge.id ? player.circuit : null;
  const payload = circuitSimulateChallengePayload(room);
  if (payload) socket.emit('circuit_simulate:challenge', payload);
  socket.emit('circuit_simulate:restored', {
    circuit,
    completed: player.completedChallenges.includes(challenge.id),
    simulationState: player.simulationState,
    validation: player.lastValidationCode && player.lastValidationFeedback && player.lastSubmissionAt !== null
      ? {
          correct: player.lastValidationCode === 'correct',
          code: player.lastValidationCode,
          feedback: player.lastValidationFeedback,
          attempts: player.submissionAttempts,
          submittedAt: player.lastSubmissionAt,
        }
      : null,
  });
  deliverPendingCircuitAssistance(room, socket, userId);
}

function evaluateCircuitSimulateChallenge(room: RoomState): void {
  const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
  if (!challenge) return;
  const c = challenge; // TypeScript narrowing workaround
  let completed = 0;
  for (const [userId, player] of room.circuitSimulatePlayers) {
    if (player.completedChallenges.includes(c.id)) continue;

    let passed = false;
    if (c.referenceCircuit) {
      /* Chấm tự động theo topology — giống circuit_draw */
      passed = !!player.circuit && circuitsMatch(player.circuit, c.referenceCircuit);
    } else if (player.circuit && player.measurements) {
      /* Fallback legacy: đo lường từ client */
      passed = true;
      for (const testCase of c.testCases) {
        for (const [output, expected] of Object.entries(testCase.expectedOutputs)) {
          const measured = player.measurements[output];
          if (measured === undefined || Math.abs(measured - expected) > 0.1) {
            passed = false;
            break;
          }
        }
        if (!passed) break;
      }
    }

    if (passed) {
        const newKttx = completeCircuitChallenge(room, player, c);
        if (newKttx === null) continue;
        completed++;
        ioRef?.to(`game:${room.roomCode}`).emit('circuit_simulate:challenge_passed', {
          userId,
          name: player.displayName,
          challengeId: c.id,
          points: c.points,
          newKttx,
        });
      }
  }
  broadcastLeaderboard(room);
  if (completed > 0) {
    ioRef?.to(`game:${room.roomCode}`).emit('circuit_simulate:results', { completed });
  }
  persistCircuitRoom(room);
  nextCircuitSimulateChallenge(room);
}

function nextCircuitSimulateChallenge(room: RoomState): void {
  room.circuitSimulateCurrentChallenge++;
  if (room.circuitSimulateCurrentChallenge >= room.circuitSimulateChallenges.length) {
    finishGame(room);
    return;
  }
  sendCircuitSimulateChallenge(room);
}

function controlCircuitSimulateChallenge(
  room: RoomState,
  action: z.infer<typeof zCircuitHostControl>['action'],
): void {
  if (action === 'pause') {
    if (!room.circuitSimulatePaused) {
      room.circuitSimulateRemainingMs = Math.max(0, room.circuitSimulateChallengeEndsAt - Date.now());
      room.circuitSimulatePaused = true;
      clearCircuitSimulateTimer(room);
      persistCircuitRuntime(room);
    }
    emitCircuitSimulateControlState(room);
    return;
  }
  if (action === 'resume') {
    if (room.circuitSimulatePaused) {
      room.circuitSimulateChallengeEndsAt = Date.now() + room.circuitSimulateRemainingMs;
      room.circuitSimulatePaused = false;
      room.circuitSimulateRemainingMs = 0;
      persistCircuitRuntime(room);
      scheduleCircuitSimulateTimer(room);
    }
    emitCircuitSimulateControlState(room);
    return;
  }
  if (action === 'extend') {
    const now = Date.now();
    if (room.circuitSimulatePaused) {
      room.circuitSimulateRemainingMs = Math.min(
        CIRCUIT_MAX_REMAINING_MS,
        Math.max(0, room.circuitSimulateRemainingMs) + CIRCUIT_EXTENSION_MS,
      );
    } else {
      const extendedRemaining = Math.min(
        CIRCUIT_MAX_REMAINING_MS,
        Math.max(0, room.circuitSimulateChallengeEndsAt - now) + CIRCUIT_EXTENSION_MS,
      );
      room.circuitSimulateChallengeEndsAt = now + extendedRemaining;
      scheduleCircuitSimulateTimer(room);
    }
    persistCircuitRuntime(room);
    emitCircuitSimulateControlState(room);
    return;
  }
  if (action === 'evaluate') {
    clearCircuitSimulateTimer(room);
    evaluateCircuitSimulateChallenge(room);
    return;
  }
  if (action === 'skip') {
    clearCircuitSimulateTimer(room);
    nextCircuitSimulateChallenge(room);
    return;
  }
  sendCircuitSimulateChallenge(
    room,
    Date.now() + room.secondsPerQuestion * 1000,
    true,
  );
}

function sendQuizShowQuestion(room: RoomState): void {
  if (room.quizShowCurrentQuestion >= room.quizShowQuestions.length) {
    finishGame(room);
    return;
  }
  const q = room.quizShowQuestions[room.quizShowCurrentQuestion]!;
  ioRef?.to(`game:${room.roomCode}`).emit('quiz_show:question', {
    index: room.quizShowCurrentQuestion,
    total: room.quizShowQuestions.length,
    question: { id: q.id, type: q.type, content: q.content, options: q.options ?? [] },
    durationSec: room.secondsPerQuestion,
  });
  room.timer = setTimeout(() => revealQuizShowAnswer(room), room.secondsPerQuestion * 1000 + 400);
}

function revealQuizShowAnswer(room: RoomState): void {
  if (room.phase !== 'quiz_show') return;
  const q = room.quizShowQuestions[room.quizShowCurrentQuestion];
  if (!q) return;
  let correctCount = 0;
  for (const player of room.quizShowPlayers.values()) {
    if (player.currentQuestion !== room.quizShowCurrentQuestion) continue;
    const ans = player.answers?.get(room.quizShowCurrentQuestion);
    if (!ans) continue;
    const correct = ans.choiceIdx === (q.type === 'mcq' ? q.correctIdx : -1);
    if (correct) {
      player.score += room.pointsPerCorrect;
      player.streak++;
      correctCount++;
    } else {
      player.streak = 0;
    }
  }
  ioRef?.to(`game:${room.roomCode}`).emit('quiz_show:reveal', {
    index: room.quizShowCurrentQuestion,
    correctIdx: q.type === 'mcq' ? q.correctIdx : -1,
    correctText: q.type === 'fill' ? q.correctText : undefined,
    scores: [...room.quizShowPlayers.values()].map((p) => ({
      userId: p.userId,
      name: p.displayName,
      score: p.score,
      streak: p.streak,
    })),
  });
  broadcastLeaderboard(room);
}

function useQuizShowLifeline(room: RoomState, userId: string, lifeline: 'fiftyFifty' | 'askAudience' | 'phoneFriend'): void {
  const player = room.quizShowPlayers.get(userId);
  if (!player || !player.lifelines[lifeline]) return;
  player.lifelines[lifeline] = false;
  const q = room.quizShowQuestions[room.quizShowCurrentQuestion];
  if (!q) return;
  if (lifeline === 'fiftyFifty' && q.type === 'mcq' && q.options) {
    const correctIdx = q.correctIdx ?? 0;
    const wrongIndices = q.options.map((_, i) => i).filter((i) => i !== correctIdx);
    const toRemove = wrongIndices.slice(0, 2);
    const remaining = q.options.map((opt, i) => (toRemove.includes(i) ? '' : opt));
    ioRef?.to(`game:${room.roomCode}`).emit('quiz_show:fifty_fifty', { userId, remaining });
  } else if (lifeline === 'askAudience') {
    const votes: number[] = q.options?.map(() => Math.floor(Math.random() * 100)) ?? [];
    const total = votes.reduce((a, b) => a + b, 0);
    const percentages = votes.map((v) => Math.round((v / (total || 1)) * 100));
    if (q.correctIdx !== undefined && percentages.length > q.correctIdx) {
      percentages[q.correctIdx]! += 20;
    }
    ioRef?.to(`game:${room.roomCode}`).emit('quiz_show:ask_audience', { userId, percentages });
  } else if (lifeline === 'phoneFriend') {
    const hint = q.type === 'mcq' && q.correctIdx !== undefined
      ? `Tôi nghĩ đáp án ${String.fromCharCode(65 + q.correctIdx)} có khả năng cao`
      : 'Tôi không chắc lắm, nhưng bạn nên suy nghĩ kỹ hơn';
    ioRef?.to(`game:${room.roomCode}`).emit('quiz_show:phone_friend', { userId, hint });
  }
}

function nextQuizShowQuestion(room: RoomState): void {
  room.quizShowCurrentQuestion++;
  if (room.quizShowCurrentQuestion >= room.quizShowQuestions.length) {
    finishGame(room);
    return;
  }
  for (const player of room.quizShowPlayers.values()) {
    player.currentQuestion = room.quizShowCurrentQuestion;
  }
  sendQuizShowQuestion(room);
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

function applyCorrectPoints(room: RoomState, userId: string, name: string): number {
  const player = room.players.get(userId);
  if (player) player.score += room.pointsPerCorrect;
  return addKttx(room.classId, userId, room.pointsPerCorrect);
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
        class_id: string | null;
      }
    | undefined;
  if (!row || row.status === 'finished') return null;

  const cfg = JSON.parse(row.config_json) as {
    secondsPerQuestion?: number;
    durationSec?: number;
    difficulty?: number;
    pointsPerCorrect?: number;
    classId?: string | null;
    puzzle?: PuzzleDef | null;
    circuitTemplate?: { components: unknown[]; wires: unknown[] } | null;
    simulateChallenges?: {
      title: string;
      description?: string;
      targetBehavior?: string;
      points: number;
      circuit?: { components: unknown[]; wires: unknown[] } | null;
    }[] | null;
    lockOnStart?: boolean;
  };
  const gameType = (['quick_quiz', 'tug_of_war', 'math_race', 'hand_raise', 'crossword', 'bingo', 'memory_match', 'word_scramble', 'quiz_show', 'circuit_draw', 'circuit_simulate'] as const).includes(
    row.game_type as never
  )
    ? (row.game_type as GameType)
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
    pointsPerCorrect: cfg.pointsPerCorrect ?? 0.5,
    classId: row.class_id ?? cfg.classId ?? null,
    puzzle: cfg.puzzle ?? null,
    solvedRows: new Set<number>(),
    hands: new Map<string, string>(),
    activePick: null,
    locked: row.status === 'running' && cfg.lockOnStart === true,
    lockOnStart: cfg.lockOnStart === true,
    blacklist: new Set<string>(),
    phase: row.status === 'running'
      ? gameType === 'math_race'
        ? 'race'
        : gameType === 'circuit_simulate'
          ? 'circuit_simulate'
          : 'question'
      : 'lobby',
    currentIndex: row.current_question_index,
    questionEndsAt: 0,
    questionStartAt: 0,
    players: new Map(),
    racePlayers: new Map(),
    ropePos: 0,
    raceEndsAt: 0,
    timer: null,
    // Bingo
    bingoNumbers: [],
    bingoCalled: [],
    bingoPlayers: new Map(),
    // Memory Match
    memoryCards: [],
    memoryPlayers: new Map(),
    memoryFlipped: [],
    // Word Scramble
    wordScrambleWords: [],
    wordScramblePlayers: new Map(),
    // Quiz Show
    quizShowQuestions: [],
    quizShowPlayers: new Map(),
    quizShowCurrentQuestion: 0,
    // Circuit Draw
    circuitDrawPlayers: new Map(),
    circuitDrawReference: null,
    circuitTemplate: cfg.circuitTemplate ?? null,
    // Circuit Simulate
    circuitSimulatePlayers: new Map(),
    circuitSimulateChallenges: [],
    circuitSimulateCurrentChallenge: 0,
    circuitSimulateChallengeEndsAt: 0,
    circuitSimulatePaused: false,
    circuitSimulateRemainingMs: 0,
    simulateChallenges: cfg.simulateChallenges
      ? cfg.simulateChallenges.map((entry, i) => ({
          id: `cfg_${i}`,
          title: entry.title,
          description: entry.description ?? '',
          targetBehavior: entry.targetBehavior ?? '',
          starterCircuit: (entry.circuit as { components: any[]; wires: any[] } | null | undefined) ?? null,
          referenceCircuit: entry.circuit ?? null,
          testCases: [],
          points: entry.points,
        }))
      : null,
  };
  rooms.set(row.room_code, room);
  if (row.status === 'running' && gameType === 'circuit_simulate') {
    if (!restoreCircuitSimulateRoom(room)) initCircuitSimulate(room);
  }
  return room;
}

function loadCircuitRoomByCodeFromDb(roomCode: string): RoomState | null {
  const row = db.prepare(`
    SELECT id FROM game_sessions
    WHERE room_code = ? AND game_type = 'circuit_simulate' AND status IN ('lobby', 'running')
    LIMIT 1
  `).get(roomCode) as { id: string } | undefined;
  return row ? loadRoomFromDb(row.id) : null;
}

function restoreActiveCircuitRooms(): void {
  const rows = db.prepare(`
    SELECT id FROM game_sessions
    WHERE game_type = 'circuit_simulate' AND status = 'running'
    ORDER BY created_at
  `).all() as unknown as { id: string }[];
  for (const row of rows) {
    try {
      loadRoomFromDb(row.id);
    } catch (error) {
      console.error(`[game] cannot restore circuit room ${row.id}`, error);
    }
  }
}

export function initGameEngine(httpServer: HttpServer): IOServer {
  const io = new IOServer(httpServer, {
    cors: { origin: false },
    maxHttpBufferSize: 1e6,
  });
  ioRef = io;
  restoreActiveCircuitRooms();

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
      if (!isRoomHost(room, socket)) {
        socket.emit('game:error', { message: 'Chỉ giáo viên tạo phòng mới có quyền điều khiển game.' });
        return;
      }
      void socket.join(`game:${room.roomCode}`);
      if (room.gameType === 'circuit_simulate') void socket.join(circuitHostRoom(room));
      socket.data.roomCode = room.roomCode;
      socket.emit('host:sync', {
        gameType: room.gameType,
        phase: room.phase,
        currentIndex: room.currentIndex,
        totalQuestions: room.questions.length,
        ropePos: Math.round(room.ropePos),
        players: [...room.players.values()].map((p) => ({ name: p.displayName, score: p.score, userId: p.userId })),
        leaderboard: leaderboard(room),
        raceRows: [...room.racePlayers.values()].map((r) => ({ name: r.displayName, solved: r.solved })),
        circuitSimulate: circuitSimulateHostSnapshot(room),
      });
    });

    socket.on('game:join', (raw: unknown) => {
      const parsed = zRoom.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student' || !socket.data.userId) return;
      const room = rooms.get(parsed.data.roomCode) ?? loadCircuitRoomByCodeFromDb(parsed.data.roomCode);
      if (!room) {
        socket.emit('game:error', { message: 'Không tìm thấy phòng. Kiểm tra lại mã phòng.' });
        return;
      }
      const userId = String(socket.data.userId);
      if (!room.classId || !isEnrolled(room.classId, userId)) {
        socket.emit('game:error', { message: 'Bạn không thuộc lớp được phép tham gia game này.' });
        return;
      }
      if (room.blacklist.has(userId)) {
        socket.emit('game:error', { message: 'Bạn đã bị giáo viên loại khỏi phiên này.' });
        return;
      }
      const user = getUserById(userId);
      if (!user) return;
      const publicUser = toPublicUser(user);

      const isRejoin =
        room.players.has(publicUser.id) ||
        room.racePlayers.has(publicUser.id) ||
        room.blacklist.has(publicUser.id);
      if (
        !isRejoin &&
        room.players.size + room.racePlayers.size >= MAX_PLAYERS
      ) {
        socket.emit('game:error', { message: `Phòng đã đầy (tối đa ${MAX_PLAYERS} thiết bị).` });
        return;
      }
      if (room.locked && !isRejoin) {
        socket.emit('game:error', { message: 'Phòng đã khóa — không nhận thêm người mới.' });
        return;
      }

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
        players: [...room.players.values()].map((p) => ({ name: p.displayName, team: p.team, userId: p.userId })),
      });
      if (room.gameType === 'tug_of_war') broadcastRope(room);
      if (room.gameType === 'crossword') emitCrosswordState(room, socket);
      if (room.gameType === 'circuit_simulate') {
        syncCircuitSimulateLearner(room, socket, publicUser.id, publicUser.displayName);
        const circuitPlayer = room.circuitSimulatePlayers.get(publicUser.id);
        if (circuitPlayer) emitCircuitSimulateProgress(room, circuitPlayer);
      }
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
      if (!isRoomHost(room, socket)) return;
      if (room.phase !== 'lobby') return;
      if (room.lockOnStart) room.locked = true;
      db.prepare("UPDATE game_sessions SET status = 'running', started_at = datetime('now') WHERE id = ?").run(room.sessionId);
      if (room.gameType === 'math_race') {
        startRace(room);
        return;
      }
      if (room.gameType === 'crossword' && room.puzzle) {
        room.phase = 'crossword';
        room.solvedRows.clear();
        emitCrosswordState(room);
        broadcastHands(room);
        return;
      }
      if (room.gameType === 'bingo') {
        initBingo(room);
        return;
      }
      if (room.gameType === 'memory_match') {
        initMemoryMatch(room);
        return;
      }
      if (room.gameType === 'word_scramble') {
        initWordScramble(room);
        return;
      }
      if (room.gameType === 'quiz_show') {
        initQuizShow(room);
        return;
      }
      if (room.gameType === 'circuit_draw') {
        initCircuitDraw(room);
        return;
      }
      if (room.gameType === 'circuit_simulate') {
        initCircuitSimulate(room);
        return;
      }
      if (room.gameType === 'tug_of_war') broadcastRope(room);
      if (room.gameType === 'crossword') emitCrosswordState(room, socket);
      room.currentIndex = 0;
      startQuestion(room);
    });

    socket.on('game:host-next', () => {
      const room = rooms.get(String(socket.data.roomCode));
      if (!isRoomHost(room, socket)) return;
      if (room.gameType === 'math_race') {
        if (room.timer) clearTimeout(room.timer);
        finishGame(room);
        return;
      }
      if (room.gameType === 'hand_raise') {
        if (room.activePick) {
          ioRef?.to(`game:${room.roomCode}`).emit('hr:released');
          room.activePick = null;
        }
        room.currentIndex += 1;
        if (room.currentIndex >= room.questions.length) finishGame(room);
        else startQuestion(room);
        return;
      }
      if (room.phase === 'question' && room.timer) {
        clearTimeout(room.timer);
        revealAnswer(room);
        return;
      }
      if (room.phase === 'leaderboard') nextStep(room);
    });

    socket.on('hr:hand', () => {
      if (socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || !('hands' in room)) return;
      if (room.gameType !== 'hand_raise' && room.gameType !== 'crossword') return;
      if (room.phase !== 'question' && room.phase !== 'crossword') return;
      if (room.activePick) return;
      const userId = String(socket.data.userId);
      const user = getUserById(userId);
      const name = user ? toPublicUser(user).displayName : 'Học viên';
      if (room.hands.has(userId)) room.hands.delete(userId);
      else room.hands.set(userId, name);
      broadcastHands(room);
    });

    socket.on('game:host-pick', (raw: unknown) => {
      const parsed = z.object({ userId: z.string() }).safeParse(raw);
      if (!parsed.success || socket.data.role === 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!isRoomHost(room, socket) || room.activePick) return;
      const target = room.players.get(parsed.data.userId);
      const raceTarget = room.racePlayers.get(parsed.data.userId);
      const name = target?.displayName ?? raceTarget?.displayName ?? room.hands.get(parsed.data.userId) ?? 'Học viên';
      room.activePick = { userId: parsed.data.userId, name };
      ioRef?.to(`game:${room.roomCode}`).emit('hr:selected', { userId: parsed.data.userId, name });
      const pickedSocket = connectedSocketsIn(room.roomCode)
        .map((id) => ioRef?.sockets.sockets.get(id))
        .find((s) => s && s.data.role === 'student' && s.data.userId === parsed.data.userId);
      pickedSocket?.emit('hr:you-picked', { gameType: room.gameType });
    });

    socket.on('game:host-release', () => {
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!isRoomHost(room, socket)) return;
      room.activePick = null;
      ioRef?.to(`game:${room.roomCode}`).emit('hr:released');
    });

    socket.on('game:host-verdict', (raw: unknown) => {
      const parsed = zVerdict.safeParse(raw);
      if (!parsed.success || socket.data.role === 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!isRoomHost(room, socket) || !room.activePick) return;
      const { userId, correct } = parsed.data;
      const player = room.players.get(userId);
      const racePlayer = room.racePlayers.get(userId);
      const name = player?.displayName ?? racePlayer?.displayName ?? room.activePick.name;

      let newTotal: number | null = null;
      if (correct) {
        newTotal = applyCorrectPoints(room, userId, name);
      }

      ioRef?.to(`game:${room.roomCode}`).emit('hr:result', {
        name,
        correct,
        delta: correct ? room.pointsPerCorrect : 0,
        newKttx: newTotal,
      });
      broadcastLeaderboard(room);

      room.activePick = null;
      room.hands.delete(userId);
      ioRef?.to(`game:${room.roomCode}`).emit('hr:released');
      broadcastHands(room);

      if (room.gameType === 'crossword' && room.solvedRows.size >= (room.puzzle?.rows.length ?? Infinity)) {
        finishGame(room);
      }
    });

    socket.on('game:host-kick', (raw: unknown) => {
      const parsed = z.object({ userId: z.string() }).safeParse(raw);
      if (!parsed.success || socket.data.role === 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!isRoomHost(room, socket)) return;
      const targetId = parsed.data.userId;
      room.blacklist.add(targetId);
      room.players.delete(targetId);
      room.racePlayers.delete(targetId);
      room.hands.delete(targetId);
      if (room.activePick?.userId === targetId) {
        room.activePick = null;
        ioRef?.to(`game:${room.roomCode}`).emit('hr:released');
      }
      for (const sid of connectedSocketsIn(room.roomCode)) {
        const s = ioRef?.sockets.sockets.get(sid);
        if (s && s.data.role === 'student' && s.data.userId === targetId) {
          s.emit('you-kicked', { message: 'Bạn đã bị giáo viên loại khỏi trò chơi.' });
          s.leave(`game:${room.roomCode}`);
          s.disconnect(true);
        }
      }
      broadcastHands(room);
      broadcastLeaderboard(room);
      broadcastRace(room);
      ioRef?.to(`game:${room.roomCode}`).emit('lobby:update', {
        count: [...room.players.values()].filter((p) => p.online).length,
        players: [...room.players.values()].map((p) => ({ name: p.displayName, team: p.team, userId: p.userId })),
      });
    });
    socket.on('cw:try', (raw: unknown) => {
      const parsed = zCwTry.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || room.gameType !== 'crossword' || !room.puzzle) return;
      if (!room.activePick || room.activePick.userId !== String(socket.data.userId)) return;
      const { rowIndex, word } = parsed.data;
      const rowDef = room.puzzle.rows[rowIndex];
      if (!rowDef || room.solvedRows.has(rowIndex)) return;

      const normalizedGiven = word.trim().toUpperCase().replace(/\s+/g, '');
      const normalizedExpected = rowDef.word.toUpperCase().replace(/\s+/g, '');
      if (normalizedGiven === normalizedExpected) {
        room.solvedRows.add(rowIndex);
        const newKttx = applyCorrectPoints(room, String(socket.data.userId), room.activePick.name);
        ioRef?.to(`game:${room.roomCode}`).emit('cw:solved', {
          rowIndex,
          name: room.activePick.name,
          delta: room.pointsPerCorrect,
          newKttx,
        });
        emitCrosswordState(room);
        broadcastLeaderboard(room);
        room.activePick = null;
        ioRef?.to(`game:${room.roomCode}`).emit('hr:released');
        if (room.solvedRows.size >= room.puzzle.rows.length) finishGame(room);
      } else {
        socket.emit('cw:wrong', { rowIndex });
      }
    });

    socket.on('game:answer', (raw: unknown) => {
      const parsed = zAnswer.safeParse(raw ?? {});
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || room.phase !== 'question') return;
      if (room.gameType === 'hand_raise' || room.gameType === 'crossword') return;
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

    // ============ BINGO ============
    socket.on('bingo:mark', (raw: unknown) => {
      const parsed = zBingoMark.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || room.gameType !== 'bingo' || room.phase !== 'bingo') return;
      const player = room.bingoPlayers.get(String(socket.data.userId));
      if (!player || player.bingo) return;
      const num = parsed.data.number;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (player.card[r]![c] === num) {
            player.marked[r]![c] = true;
            ioRef?.to(`game:${room.roomCode}`).emit('bingo:marked', {
              userId: player.userId,
              name: player.displayName,
              row: r,
              col: c,
            });
            return;
          }
        }
      }
    });

    // ============ MEMORY MATCH ============
    socket.on('memory:flip', (raw: unknown) => {
      const parsed = zMemoryFlip.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || room.gameType !== 'memory_match' || room.phase !== 'memory_match') return;
      checkMemoryMatch(room, String(socket.data.userId), parsed.data.cardIndex);
    });

    // ============ WORD SCRAMBLE ============
    socket.on('word_scramble:guess', (raw: unknown) => {
      const parsed = zWordScrambleGuess.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || room.gameType !== 'word_scramble' || room.phase !== 'word_scramble') return;
      checkWordScramble(room, String(socket.data.userId), parsed.data.word);
    });

    // ============ QUIZ SHOW ============
    socket.on('quiz_show:answer', (raw: unknown) => {
      const parsed = zQuizShowAnswer.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || room.gameType !== 'quiz_show' || room.phase !== 'quiz_show') return;
      const player = room.quizShowPlayers.get(String(socket.data.userId));
      if (!player) return;
      if (player.answers?.has(room.quizShowCurrentQuestion)) return;
      if (!player.answers) player.answers = new Map();
      player.answers.set(room.quizShowCurrentQuestion, {
        choiceIdx: parsed.data.choiceIdx,
        lifeline: parsed.data.lifeline,
      });
      if (parsed.data.lifeline) {
        useQuizShowLifeline(room, player.userId, parsed.data.lifeline);
      }
    });

    socket.on('quiz_show:next', () => {
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!isRoomHost(room, socket) || room.gameType !== 'quiz_show') return;
      if (room.phase !== 'quiz_show') return;
      nextQuizShowQuestion(room);
    });

    // ============ CIRCUIT DRAW ============
    socket.on('circuit_draw:submit', (raw: unknown) => {
      const parsed = zCircuitDraw.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || room.gameType !== 'circuit_draw' || room.phase !== 'circuit_draw') return;
      const player = room.circuitDrawPlayers.get(String(socket.data.userId));
      if (!player || player.submitted) return;
      player.circuit = parsed.data;
      player.submitted = true;

      ioRef?.to(`game:${room.roomCode}`).emit('circuit_draw:submitted', {
        userId: player.userId,
        name: player.displayName,
        circuit: parsed.data,
      });

      /* Auto-grade khi GV có mạch mẫu */
      const reference = room.circuitTemplate;
      if (reference) {
        const ok = circuitsMatch(parsed.data, reference);
        player.verified = ok;
        player.feedback = ok
          ? 'Mạch khớp với mạch mẫu của giáo viên'
          : 'Mạch chưa khớp — kiểm tra lại loại linh kiện và cách nối dây';
        let newKttx: number | null = null;
        if (ok) {
          player.score += room.pointsPerCorrect;
          newKttx = applyCorrectPoints(room, player.userId, player.displayName);
        }
        ioRef?.to(`game:${room.roomCode}`).emit('circuit_draw:verified', {
          userId: player.userId,
          name: player.displayName,
          correct: ok,
          feedback: player.feedback,
          newKttx,
          auto: true,
        });
        broadcastLeaderboard(room);
        /* Chưa khớp → cho nộp lại */
        if (!ok) player.submitted = false;
      }
    });

    socket.on('circuit_draw:verify', (raw: unknown) => {
      const parsed = z.object({ userId: z.string(), correct: z.boolean(), feedback: z.string().optional() }).safeParse(raw);
      if (!parsed.success || socket.data.role === 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!isRoomHost(room, socket) || room.gameType !== 'circuit_draw') return;
      const player = room.circuitDrawPlayers.get(parsed.data.userId);
      if (!player) return;
      player.verified = parsed.data.correct;
      player.feedback = parsed.data.feedback ?? '';
      if (parsed.data.correct) {
        player.score += room.pointsPerCorrect;
        const newKttx = applyCorrectPoints(room, player.userId, player.displayName);
        ioRef?.to(`game:${room.roomCode}`).emit('circuit_draw:verified', {
          userId: player.userId,
          name: player.displayName,
          correct: true,
          feedback: player.feedback,
          newKttx,
        });
      } else {
        ioRef?.to(`game:${room.roomCode}`).emit('circuit_draw:verified', {
          userId: player.userId,
          name: player.displayName,
          correct: false,
          feedback: player.feedback,
        });
      }
      broadcastLeaderboard(room);
    });

    // ============ CIRCUIT SIMULATE ============
    socket.on('circuit_simulate:host-control', (raw: unknown) => {
      const parsed = zCircuitHostControl.safeParse(raw);
      if (!parsed.success || socket.data.role === 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!isRoomHost(room, socket) || room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
      controlCircuitSimulateChallenge(room, parsed.data.action);
    });

    socket.on('circuit_simulate:inspect', (raw: unknown) => {
      const parsed = zCircuitInspect.safeParse(raw);
      if (!parsed.success || socket.data.role === 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!isRoomHost(room, socket) || room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
      const player = room.circuitSimulatePlayers.get(parsed.data.userId);
      if (!player) {
        socket.emit('game:error', { message: 'Không tìm thấy trạng thái mạch của học viên.' });
        return;
      }
      circuitInspectionSubscriptions.set(socket.id, { roomCode: room.roomCode, userId: player.userId });
      socket.emit('circuit_simulate:inspection', circuitSimulateInspection(room, player));
    });

    socket.on('circuit_simulate:teacher-message', (raw: unknown) => {
      const parsed = zCircuitTeacherMessage.safeParse(raw);
      if (!parsed.success || socket.data.role === 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!isRoomHost(room, socket) || room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
      const player = room.circuitSimulatePlayers.get(parsed.data.userId);
      if (!player) {
        socket.emit('game:error', { message: 'Kh\u00f4ng t\u00ecm th\u1ea5y h\u1ecdc vi\u00ean \u0111\u1ec3 h\u1ed7 tr\u1ee3.' });
        return;
      }
      const message = parsed.data.kind === 'hint'
        ? (parsed.data.message ?? '').trim()
        : (parsed.data.message ?? '').trim() || 'Gi\u00e1o vi\u00ean \u0111\u1ec1 ngh\u1ecb b\u1ea1n ki\u1ec3m tra l\u1ea1i m\u1ea1ch v\u00e0 n\u1ed9p l\u1ea1i khi s\u1eb5n s\u00e0ng.';
      if (!message) {
        socket.emit('game:error', { message: 'Vui l\u00f2ng nh\u1eadp n\u1ed9i dung g\u1ee3i \u00fd.' });
        return;
      }
      const teacher = getUserById(String(socket.data.userId));
      const teacherName = teacher ? toPublicUser(teacher).displayName : 'Gi\u00e1o vi\u00ean';
      const sentAt = Date.now();
      const messageId = randomUUID();
      db.prepare(`
        INSERT INTO game_circuit_assistance (
          game_session_id, student_id, message_id, kind, message, teacher_name,
          sent_at, delivered_at, acknowledged_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, datetime('now'))
        ON CONFLICT(game_session_id, student_id) DO UPDATE SET
          message_id = excluded.message_id,
          kind = excluded.kind,
          message = excluded.message,
          teacher_name = excluded.teacher_name,
          sent_at = excluded.sent_at,
          delivered_at = NULL,
          acknowledged_at = NULL,
          updated_at = datetime('now')
      `).run(room.sessionId, player.userId, messageId, parsed.data.kind, message, teacherName, sentAt);
      const payload = { messageId, kind: parsed.data.kind, message, teacherName, sentAt };
      const learnerSockets = connectedSocketsIn(room.roomCode)
        .map((socketId) => ioRef?.sockets.sockets.get(socketId))
        .filter((candidate): candidate is Socket => (
          candidate?.data.role === 'student' && String(candidate.data.userId) === player.userId
        ));
      for (const learnerSocket of learnerSockets) {
        learnerSocket.data.circuitAssistanceMessageId = messageId;
        learnerSocket.emit('circuit_simulate:teacher-message', payload);
      }
      let assistance = getCircuitAssistance(room.sessionId, player.userId);
      if (!assistance) return;
      if (learnerSockets.length > 0) {
        assistance = markCircuitAssistanceDelivered(room, assistance, Date.now());
      }
      emitCircuitAssistanceStatus(room, assistance);
      socket.emit('circuit_simulate:teacher-message-sent', {
        userId: player.userId,
        name: player.displayName,
        messageId,
        kind: parsed.data.kind,
        delivered: learnerSockets.length > 0,
        status: circuitAssistanceStatus(assistance),
      });
    });

    socket.on('circuit_simulate:teacher-message-ack', (raw: unknown) => {
      const parsed = zCircuitTeacherMessageAck.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
      const userId = String(socket.data.userId);
      const row = getCircuitAssistance(room.sessionId, userId);
      if (!row || row.message_id !== parsed.data.messageId) return;
      const acknowledgedAt = Date.now();
      db.prepare(`
        UPDATE game_circuit_assistance
        SET delivered_at = COALESCE(delivered_at, ?),
            acknowledged_at = COALESCE(acknowledged_at, ?),
            updated_at = datetime('now')
        WHERE game_session_id = ? AND student_id = ? AND message_id = ?
      `).run(acknowledgedAt, acknowledgedAt, room.sessionId, userId, row.message_id);
      const acknowledged = getCircuitAssistance(room.sessionId, userId);
      if (!acknowledged) return;
      socket.emit('circuit_simulate:teacher-message-acknowledged', { messageId: acknowledged.message_id });
      emitCircuitAssistanceStatus(room, acknowledged);
    });

    socket.on('circuit_simulate:circuit', (raw: unknown) => {
      const parsed = zCircuitDraw.safeParse(raw); // Reuse same schema for circuit data
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
      const player = room.circuitSimulatePlayers.get(String(socket.data.userId));
      if (!player) return;
      const challenge = room.circuitSimulateChallenges[room.circuitSimulateCurrentChallenge];
      if (!challenge) return;
      player.circuit = parsed.data;
      player.circuitChallengeId = challenge.id;
      player.lastActivityAt = Date.now();

      const validation = circuitValidationResult(player.circuit, challenge.referenceCircuit);
      if (parsed.data.submitted) {
        player.submissionAttempts += 1;
        player.totalSubmissionAttempts += 1;
        if (!validation.correct) player.incorrectSubmissionAttempts += 1;
        player.lastSubmissionAt = player.lastActivityAt;
        player.lastValidationCode = validation.code;
        player.lastValidationFeedback = validation.feedback;
        socket.emit('circuit_simulate:validation', {
          ...validation,
          attempts: player.submissionAttempts,
          submittedAt: player.lastSubmissionAt,
        });
      }
      if (parsed.data.submitted && challenge.referenceCircuit && !player.completedChallenges.includes(challenge.id) && validation.correct) {
        const newKttx = completeCircuitChallenge(room, player, challenge);
        ioRef?.to(`game:${room.roomCode}`).emit('circuit_simulate:challenge_passed', {
          userId: player.userId,
          name: player.displayName,
          challengeId: challenge.id,
          points: challenge.points,
          newKttx: newKttx ?? 0,
        });
        broadcastLeaderboard(room);
      }
      persistCircuitPlayer(room, player);
      emitCircuitSimulateProgress(room, player);
      emitCircuitSimulateInspectionUpdate(room, player);
    });

    socket.on('circuit_simulate:measurements', (raw: unknown) => {
      const parsed = z.object({ measurements: z.record(z.string(), z.number()) }).safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
      const player = room.circuitSimulatePlayers.get(String(socket.data.userId));
      if (!player) return;
      player.measurements = parsed.data.measurements;
      player.lastActivityAt = Date.now();
      persistCircuitPlayer(room, player);
      emitCircuitSimulateProgress(room, player);
      emitCircuitSimulateInspectionUpdate(room, player);
    });

    socket.on('circuit_simulate:simulate', (raw: unknown) => {
      const parsed = zCircuitSimulate.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student') return;
      const room = rooms.get(String(socket.data.roomCode ?? ''));
      if (!room || room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
      const player = room.circuitSimulatePlayers.get(String(socket.data.userId));
      if (!player) return;
      player.simulationState = parsed.data.action;
      player.lastActivityAt = Date.now();
      persistCircuitPlayer(room, player);
      emitCircuitSimulateProgress(room, player);
      emitCircuitSimulateInspectionUpdate(room, player);
      // In a real implementation, this would run a SPICE simulation
      // For now, we just acknowledge the action
      socket.emit('circuit_simulate:simulation_state', {
        state: parsed.data.action,
        timeStep: parsed.data.timeStep ?? 0.001,
      });
    });

    socket.on('disconnecting', () => {
      circuitInspectionSubscriptions.delete(socket.id);
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      untrackSocketRoom(socket.id, code);
      const room = rooms.get(code);
      if (room) {
        const player = room.players.get(String(socket.data.userId));
        if (player) player.online = false;
        if (room.gameType === 'circuit_simulate') {
          const circuitPlayer = room.circuitSimulatePlayers.get(String(socket.data.userId));
          if (circuitPlayer) emitCircuitSimulateProgress(room, circuitPlayer);
        }
        io.to(`game:${room.roomCode}`).emit('lobby:update', {
          count: [...room.players.values()].filter((p) => p.online).length,
          players: [...room.players.values()].map((p) => ({ name: p.displayName, team: p.team, userId: p.userId })),
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
