import type { Socket } from 'socket.io';

import { db } from '../db/connection.js';
import type { RoomState } from './gameTypes.js';

type ClassicGameModes = {
  initBingo: (room: RoomState) => void;
  initMemoryMatch: (room: RoomState) => void;
  initWordScramble: (room: RoomState) => void;
  initQuizShow: (room: RoomState) => void;
};

export function registerGameControlHandlers(socket: Socket, {
  getRoom,
  getIo,
  isRoomHost,
  startRace,
  initCircuitDraw,
  initCircuitSimulate,
  emitCrosswordState,
  broadcastHands,
  broadcastRope,
  startQuestion,
  finishGame,
  revealAnswer,
  nextStep,
  classicGameModes,
}: {
  getRoom: () => RoomState | undefined;
  getIo: () => { to: (room: string) => { emit: (event: string, payload?: unknown) => void } } | null;
  isRoomHost: (room: RoomState | undefined, socket: Socket) => room is RoomState;
  startRace: (room: RoomState) => void;
  initCircuitDraw: (room: RoomState) => void;
  initCircuitSimulate: (room: RoomState) => void;
  emitCrosswordState: (room: RoomState, target?: Socket) => void;
  broadcastHands: (room: RoomState) => void;
  broadcastRope: (room: RoomState) => void;
  startQuestion: (room: RoomState) => void;
  finishGame: (room: RoomState) => void;
  revealAnswer: (room: RoomState) => void;
  nextStep: (room: RoomState) => void;
  classicGameModes: ClassicGameModes;
}): void {
  socket.on('game:host-start', () => {
    const room = getRoom();
    if (!isRoomHost(room, socket) || room.phase !== 'lobby') return;
    if (room.lockOnStart) room.locked = true;
    db.prepare("UPDATE game_sessions SET status = 'running', started_at = datetime('now') WHERE id = ?").run(room.sessionId);
    if (room.gameType === 'math_race') return startRace(room);
    if (room.gameType === 'crossword' && room.puzzle) {
      room.phase = 'crossword';
      room.solvedRows.clear();
      emitCrosswordState(room);
      broadcastHands(room);
      return;
    }
    if (room.gameType === 'bingo') return classicGameModes.initBingo(room);
    if (room.gameType === 'memory_match') return classicGameModes.initMemoryMatch(room);
    if (room.gameType === 'word_scramble') return classicGameModes.initWordScramble(room);
    if (room.gameType === 'quiz_show') return classicGameModes.initQuizShow(room);
    if (room.gameType === 'circuit_draw') return initCircuitDraw(room);
    if (room.gameType === 'circuit_simulate') return initCircuitSimulate(room);
    if (room.gameType === 'tug_of_war') broadcastRope(room);
    if (room.gameType === 'crossword') emitCrosswordState(room, socket);
    room.currentIndex = 0;
    startQuestion(room);
  });

  socket.on('game:host-next', () => {
    const room = getRoom();
    if (!isRoomHost(room, socket)) return;
    if (room.gameType === 'math_race') {
      if (room.timer) clearTimeout(room.timer);
      finishGame(room);
      return;
    }
    if (room.gameType === 'hand_raise') {
      if (room.activePick) {
        getIo()?.to(`game:${room.roomCode}`).emit('hr:released');
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
}
