import type { Socket } from 'socket.io';

import { zAnswer, zMathAnswer } from './gameSchemas.js';
import { generateMathProblem } from './gameUtils.js';
import type { RoomState } from './gameTypes.js';

export function registerAnswerHandlers(socket: Socket, {
  getRoom,
  broadcastRace,
}: {
  getRoom: () => RoomState | undefined;
  broadcastRace: (room: RoomState) => void;
}): void {
  socket.on('game:answer', (raw: unknown) => {
    const parsed = zAnswer.safeParse(raw ?? {});
    if (!parsed.success || socket.data.role !== 'student') return;
    const room = getRoom();
    if (!room || room.phase !== 'question') return;
    if (room.gameType === 'hand_raise' || room.gameType === 'crossword') return;
    const player = room.players.get(String(socket.data.userId));
    if (!player || player.answers.has(room.currentIndex)) return;
    const msTaken = Math.max(0, Date.now() - room.questionStartAt);
    if (msTaken > room.secondsPerQuestion * 1000 + 600) return;
    const question = room.questions[room.currentIndex];
    const choiceIdx = question?.type === 'fill' ? -1 : parsed.data.choiceIdx;
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
    const room = getRoom();
    if (!room || room.gameType !== 'math_race' || room.phase !== 'race') return;
    const player = room.racePlayers.get(String(socket.data.userId));
    if (!player || !player.current) return;
    const given = String(parsed.data.answer).trim();
    if (given === player.current.answer) {
      player.solved += 1;
      player.wrongStreak = 0;
      player.current = generateMathProblem(room.raceDifficulty);
      socket.emit('math:problem', { text: player.current.text, endsAt: room.raceEndsAt });
      broadcastRace(room);
    } else {
      player.wrongStreak += 1;
      socket.emit('math:wrong', { streak: player.wrongStreak });
    }
  });
}
