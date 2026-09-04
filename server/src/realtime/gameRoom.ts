import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server as IOServer, type Socket } from 'socket.io';
import { generateMathProblem } from './gameUtils.js';
import { createClassicGameModes } from './classicGameModes.js';
import { createGameLifecycle } from './gameLifecycle.js';
import { circuitValidationResult, circuitsMatch } from './circuitTopology.js';
import { configureCircuitSimulateChallenges } from './circuitChallenges.js';
import { circuitHostRoom, circuitSimulateInspection, circuitSimulateProgressRow, circuitSimulateProgressSnapshot } from './circuitMonitoring.js';
import { createCircuitAssistance } from './circuitAssistance.js';
import { createCircuitScoring } from './circuitScoring.js';
import { createCircuitRecovery } from './circuitRecovery.js';
import { registerCircuitDrawHandlers } from './circuitDrawHandlers.js';
import { registerClassicGameHandlers } from './classicGameHandlers.js';
import { registerRoomInteractionHandlers } from './roomInteractionHandlers.js';
import { persistCircuitPlayer, persistCircuitRoom, persistCircuitRuntime } from './circuitPersistence.js';
import { trackSocketRoom, untrackSocketRoom } from './socketRoomIndex.js';
import { findRoomBySession } from './roomLookup.js';
import { authenticateSocket } from './socketAuth.js';
import { addKttx, isEnrolled, isRoomHost } from './roomAccess.js';
import { zAnswer, zCircuitDraw, zCircuitHostControl, zCircuitInspect, zCircuitMeasurements, zCircuitSimulate, zCircuitTeacherMessage, zCircuitTeacherMessageAck, zMathAnswer, zRoom, zSessionId, zUserId } from './gameSchemas.js';
import type { CircuitHostControlAction } from './gameSchemas.js';
import type { PuzzleDef, GameType, GameQuestion, PlayerInfo, RacePlayer, BingoPlayer, MemoryMatchPlayer, WordScramblePlayer, QuizShowPlayer, CircuitDrawPlayer, CircuitValidationCode, CircuitSimulatePlayer, Phase, RoomState } from './gameTypes.js';
import { buildLeaderboard } from './leaderboard.js';

import { db, queryAll, getUserById, toPublicUser } from '../db/connection.js';

const CIRCUIT_EXTENSION_MS = 30_000;
const CIRCUIT_MAX_REMAINING_MS = 10 * 60_000;


const MAX_PLAYERS = 60;

const rooms = new Map<string, RoomState>();
const circuitInspectionSubscriptions = new Map<string, { roomCode: string; userId: string }>();
let ioRef: IOServer | null = null;
const gameLifecycle = createGameLifecycle({
  getIo: () => ioRef,
  broadcastLeaderboard,
  broadcastRope,
  broadcastHands,
  circuitHostRoom,
  removeRoom: (roomCode) => rooms.delete(roomCode),
});
const { finishGame, revealAnswer, startQuestion, nextStep } = gameLifecycle;
const circuitAssistance = createCircuitAssistance({ getIo: () => ioRef, circuitHostRoom });
const {
  circuitAssistanceStatus,
  circuitAssistanceSnapshot,
  getCircuitAssistance,
  markCircuitAssistanceDelivered,
  emitCircuitAssistanceStatus,
  deliverPendingCircuitAssistance,
} = circuitAssistance;
const classicGameModes = createClassicGameModes({
  getIo: () => ioRef,
  finishGame,
  applyCorrectPoints,
  broadcastLeaderboard,
});
const { completeCircuitChallenge } = createCircuitScoring({ applyCorrectPoints, persistCircuitPlayer });
const { restoreCircuitSimulateRoom } = createCircuitRecovery({
  clearTimer: clearCircuitSimulateTimer,
  scheduleTimer: scheduleCircuitSimulateTimer,
});


function broadcastLeaderboard(room: RoomState): void {
  ioRef?.to(`game:${room.roomCode}`).emit('leaderboard:update', { rows: buildLeaderboard(room), phase: room.phase });
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

// ============ CIRCUIT SIMULATE ============
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
  action: CircuitHostControlAction,
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
    const payload = authenticateSocket(socket);
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
      const parsed = zSessionId.safeParse(raw);
      if (!parsed.success || socket.data.role === 'student') return;
      const room = findRoomBySession(rooms.values(), parsed.data.sessionId) ?? loadRoomFromDb(parsed.data.sessionId);
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
        leaderboard: buildLeaderboard(room),
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
        trackSocketRoom(socketRoomsIndex, socket.id, room.roomCode);
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
      trackSocketRoom(socketRoomsIndex, socket.id, room.roomCode);

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
        classicGameModes.initBingo(room);
        return;
      }
      if (room.gameType === 'memory_match') {
        classicGameModes.initMemoryMatch(room);
        return;
      }
      if (room.gameType === 'word_scramble') {
        classicGameModes.initWordScramble(room);
        return;
      }
      if (room.gameType === 'quiz_show') {
        classicGameModes.initQuizShow(room);
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

    registerRoomInteractionHandlers(socket, {
      getRoom: () => rooms.get(String(socket.data.roomCode ?? '')),
      getIo: () => ioRef,
      getSocketIds: connectedSocketsIn,
      getDisplayName: (userId) => {
        const user = getUserById(userId);
        return user ? toPublicUser(user).displayName : 'Học viên';
      },
      isRoomHost,
      applyCorrectPoints,
      broadcastLeaderboard,
      broadcastRace,
      broadcastHands,
      emitCrosswordState,
      finishGame,
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

    registerClassicGameHandlers(socket, {
      getRoom: () => rooms.get(String(socket.data.roomCode ?? '')),
      getIo: () => ioRef,
      isRoomHost,
      classicGameModes,
    });

    registerCircuitDrawHandlers(socket, {
      getRoom: () => rooms.get(String(socket.data.roomCode ?? '')),
      getIo: () => ioRef,
      isRoomHost,
      circuitsMatch,
      applyCorrectPoints,
      broadcastLeaderboard,
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
      const parsed = zCircuitMeasurements.safeParse(raw);
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
      untrackSocketRoom(socketRoomsIndex, socket.id, code);
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

