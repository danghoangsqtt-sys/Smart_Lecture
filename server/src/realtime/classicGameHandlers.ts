import type { Server as IOServer, Socket } from 'socket.io';

import { zBingoMark, zMemoryFlip, zQuizShowAnswer, zWordScrambleGuess } from './gameSchemas.js';
import type { RoomState } from './gameTypes.js';

type ClassicGameModes = {
  checkMemoryMatch: (room: RoomState, userId: string, cardIndex: number) => void;
  checkWordScramble: (room: RoomState, userId: string, word: string) => void;
  useQuizShowLifeline: (room: RoomState, userId: string, lifeline: 'fiftyFifty' | 'askAudience' | 'phoneFriend') => void;
  nextQuizShowQuestion: (room: RoomState) => void;
};

export function registerClassicGameHandlers(socket: Socket, {
  getRoom,
  getIo,
  isRoomHost,
  classicGameModes,
}: {
  getRoom: () => RoomState | undefined;
  getIo: () => IOServer | null;
  isRoomHost: (room: RoomState | undefined, socket: Socket) => boolean;
  classicGameModes: ClassicGameModes;
}): void {
  socket.on('bingo:mark', (raw: unknown) => {
    const parsed = zBingoMark.safeParse(raw);
    if (!parsed.success || socket.data.role !== 'student') return;
    const room = getRoom();
    if (!room || room.gameType !== 'bingo' || room.phase !== 'bingo') return;
    const player = room.bingoPlayers.get(String(socket.data.userId));
    if (!player || player.bingo) return;
    const num = parsed.data.number;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (player.card[r]![c] === num) {
          player.marked[r]![c] = true;
          getIo()?.to(`game:${room.roomCode}`).emit('bingo:marked', {
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

  socket.on('memory:flip', (raw: unknown) => {
    const parsed = zMemoryFlip.safeParse(raw);
    if (!parsed.success || socket.data.role !== 'student') return;
    const room = getRoom();
    if (!room || room.gameType !== 'memory_match' || room.phase !== 'memory_match') return;
    classicGameModes.checkMemoryMatch(room, String(socket.data.userId), parsed.data.cardIndex);
  });

  socket.on('word_scramble:guess', (raw: unknown) => {
    const parsed = zWordScrambleGuess.safeParse(raw);
    if (!parsed.success || socket.data.role !== 'student') return;
    const room = getRoom();
    if (!room || room.gameType !== 'word_scramble' || room.phase !== 'word_scramble') return;
    classicGameModes.checkWordScramble(room, String(socket.data.userId), parsed.data.word);
  });

  socket.on('quiz_show:answer', (raw: unknown) => {
    const parsed = zQuizShowAnswer.safeParse(raw);
    if (!parsed.success || socket.data.role !== 'student') return;
    const room = getRoom();
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
      classicGameModes.useQuizShowLifeline(room, player.userId, parsed.data.lifeline);
    }
  });

  socket.on('quiz_show:next', () => {
    const room = getRoom();
    if (!room || !isRoomHost(room, socket) || room.gameType !== 'quiz_show') return;
    if (room.phase !== 'quiz_show') return;
    classicGameModes.nextQuizShowQuestion(room);
  });
}
