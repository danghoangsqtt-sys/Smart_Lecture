import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { generateMathProblem } from './gameUtils.js';
import { createClassicGameModes } from './classicGameModes.js';
import { createGameLifecycle } from './gameLifecycle.js';
import { circuitsMatch } from './circuitTopology.js';
import { circuitHostRoom, circuitSimulateInspection } from './circuitMonitoring.js';
import { createCircuitAssistance } from './circuitAssistance.js';
import { createCircuitScoring } from './circuitScoring.js';
import { createCircuitRecovery } from './circuitRecovery.js';
import { createCircuitSimulateRuntime } from './circuitSimulateRuntime.js';
import { createRoomStore } from './roomStore.js';
import { createCircuitDrawLifecycle, registerCircuitDrawHandlers } from './circuitDrawHandlers.js';
import { registerClassicGameHandlers } from './classicGameHandlers.js';
import { registerRoomInteractionHandlers } from './roomInteractionHandlers.js';
import { registerAnswerHandlers } from './answerHandlers.js';
import { registerCircuitSimulateHandlers } from './circuitSimulateHandlers.js';
import { registerGameControlHandlers } from './gameControlHandlers.js';
import { persistCircuitPlayer } from './circuitPersistence.js';
import { trackSocketRoom, untrackSocketRoom } from './socketRoomIndex.js';
import { findRoomBySession } from './roomLookup.js';
import { authenticateSocket } from './socketAuth.js';
import { addKttx, isEnrolled, isRoomHost } from './roomAccess.js';
import { zRoom, zSessionId } from './gameSchemas.js';
import type { RoomState } from './gameTypes.js';
import { buildLeaderboard } from './leaderboard.js';

import { getUserById, toPublicUser } from '../db/connection.js';

const MAX_PLAYERS = 60;

const rooms = new Map<string, RoomState>();
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
  circuitAssistanceSnapshot,
  getCircuitAssistance,
  markCircuitAssistanceDelivered,
  emitCircuitAssistanceStatus,
  circuitAssistanceStatus,
  deliverPendingCircuitAssistance,
} = circuitAssistance;
const classicGameModes = createClassicGameModes({
  getIo: () => ioRef,
  finishGame,
  applyCorrectPoints,
  broadcastLeaderboard,
});
const { completeCircuitChallenge } = createCircuitScoring({ applyCorrectPoints, persistCircuitPlayer });
const circuitSimulateRuntime = createCircuitSimulateRuntime({
  getIo: () => ioRef,
  finishGame,
  completeCircuitChallenge,
  broadcastLeaderboard,
  circuitAssistanceSnapshot,
  deliverPendingCircuitAssistance,
});
const { restoreCircuitSimulateRoom } = createCircuitRecovery({
  clearTimer: circuitSimulateRuntime.clearTimer,
  scheduleTimer: circuitSimulateRuntime.scheduleTimer,
});
const { initCircuitDraw } = createCircuitDrawLifecycle({ getIo: () => ioRef });
  const { loadRoomFromDb, loadJoinableRoomByCodeFromDb, restoreActiveCircuitRooms } = createRoomStore({
  rooms,
  initCircuitSimulate: circuitSimulateRuntime.init,
  restoreCircuitSimulateRoom,
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

function applyCorrectPoints(room: RoomState, userId: string): number {
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
        circuitSimulate: circuitSimulateRuntime.hostSnapshot(room),
      });
    });

    socket.on('game:join', (raw: unknown) => {
      const parsed = zRoom.safeParse(raw);
      if (!parsed.success || socket.data.role !== 'student' || !socket.data.userId) return;
      const room = rooms.get(parsed.data.roomCode) ?? loadJoinableRoomByCodeFromDb(parsed.data.roomCode);
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
        circuitSimulateRuntime.syncLearner(room, socket, publicUser.id, publicUser.displayName);
        const circuitPlayer = room.circuitSimulatePlayers.get(publicUser.id);
        if (circuitPlayer) circuitSimulateRuntime.emitProgress(room, circuitPlayer);
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

    registerGameControlHandlers(socket, {
      getRoom: () => rooms.get(String(socket.data.roomCode ?? '')),
      getIo: () => ioRef,
      isRoomHost,
      startRace,
      initCircuitDraw,
      initCircuitSimulate: circuitSimulateRuntime.init,
      emitCrosswordState,
      broadcastHands,
      broadcastRope,
      startQuestion,
      finishGame,
      revealAnswer,
      nextStep,
      classicGameModes,
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

    registerAnswerHandlers(socket, {
      getRoom: () => rooms.get(String(socket.data.roomCode ?? '')),
      broadcastRace,
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

    registerCircuitSimulateHandlers(socket, {
      getRoom: () => rooms.get(String(socket.data.roomCode ?? '')),
      getIo: () => ioRef,
      getSocketIds: connectedSocketsIn,
      subscribeInspection: circuitSimulateRuntime.subscribeInspection,
      isRoomHost,
      controlChallenge: circuitSimulateRuntime.control,
      getCircuitAssistance,
      markCircuitAssistanceDelivered,
      emitCircuitAssistanceStatus,
      circuitAssistanceStatus,
      completeCircuitChallenge,
      persistCircuitPlayer,
      emitProgress: circuitSimulateRuntime.emitProgress,
      emitInspectionUpdate: circuitSimulateRuntime.emitInspectionUpdate,
      broadcastLeaderboard,
      circuitSimulateInspection,
    });

    socket.on('disconnecting', () => {
      circuitSimulateRuntime.unsubscribeInspection(socket.id);
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      untrackSocketRoom(socketRoomsIndex, socket.id, code);
      const room = rooms.get(code);
      if (room) {
        const player = room.players.get(String(socket.data.userId));
        if (player) player.online = false;
        if (room.gameType === 'circuit_simulate') {
          const circuitPlayer = room.circuitSimulatePlayers.get(String(socket.data.userId));
          if (circuitPlayer) circuitSimulateRuntime.emitProgress(room, circuitPlayer);
        }
        io.to(`game:${room.roomCode}`).emit('lobby:update', {
          count: [...room.players.values()].filter((p) => p.online).length,
          players: [...room.players.values()].map((p) => ({ name: p.displayName, team: p.team, userId: p.userId })),
        });
      }
    });
  });

  const roomSweep = setInterval(() => {
    for (const [code, room] of rooms) {
      if (room.phase === 'finished' && Date.now() - room.questionEndsAt > 10 * 60_000) {
        rooms.delete(code);
        socketRoomsIndex.delete(code);
      }
    }
  }, 60_000);
  roomSweep.unref();

  return io;
}
