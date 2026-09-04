import type { Server as IOServer, Socket } from 'socket.io';

import { zCircuitDraw, zCircuitDrawVerify } from './gameSchemas.js';
import type { RoomState } from './gameTypes.js';

export function registerCircuitDrawHandlers(socket: Socket, {
  getRoom,
  getIo,
  isRoomHost,
  circuitsMatch,
  applyCorrectPoints,
  broadcastLeaderboard,
}: {
  getRoom: () => RoomState | undefined;
  getIo: () => IOServer | null;
  isRoomHost: (room: RoomState | undefined, socket: Socket) => boolean;
  circuitsMatch: (student: unknown, reference: unknown) => boolean;
  applyCorrectPoints: (room: RoomState, userId: string, name: string) => number;
  broadcastLeaderboard: (room: RoomState) => void;
}): void {
  socket.on('circuit_draw:submit', (raw: unknown) => {
    const parsed = zCircuitDraw.safeParse(raw);
    if (!parsed.success || socket.data.role !== 'student') return;
    const room = getRoom();
    if (!room || room.gameType !== 'circuit_draw' || room.phase !== 'circuit_draw') return;
    const player = room.circuitDrawPlayers.get(String(socket.data.userId));
    if (!player || player.submitted) return;
    player.circuit = parsed.data;
    player.submitted = true;

    getIo()?.to(`game:${room.roomCode}`).emit('circuit_draw:submitted', {
      userId: player.userId,
      name: player.displayName,
      circuit: parsed.data,
    });

    const reference = room.circuitTemplate;
    if (!reference) return;
    const correct = circuitsMatch(parsed.data, reference);
    player.verified = correct;
    player.feedback = correct
      ? 'Mạch khớp với mạch mẫu của giáo viên'
      : 'Mạch chưa khớp — kiểm tra lại loại linh kiện và cách nối dây';
    let newKttx: number | null = null;
    if (correct) {
      player.score += room.pointsPerCorrect;
      newKttx = applyCorrectPoints(room, player.userId, player.displayName);
    }
    getIo()?.to(`game:${room.roomCode}`).emit('circuit_draw:verified', {
      userId: player.userId,
      name: player.displayName,
      correct,
      feedback: player.feedback,
      newKttx,
      auto: true,
    });
    broadcastLeaderboard(room);
    if (!correct) player.submitted = false;
  });

  socket.on('circuit_draw:verify', (raw: unknown) => {
    const parsed = zCircuitDrawVerify.safeParse(raw);
    if (!parsed.success || socket.data.role === 'student') return;
    const room = getRoom();
    if (!isRoomHost(room, socket) || room?.gameType !== 'circuit_draw') return;
    const player = room.circuitDrawPlayers.get(parsed.data.userId);
    if (!player) return;
    player.verified = parsed.data.correct;
    player.feedback = parsed.data.feedback ?? '';
    if (parsed.data.correct) {
      player.score += room.pointsPerCorrect;
      const newKttx = applyCorrectPoints(room, player.userId, player.displayName);
      getIo()?.to(`game:${room.roomCode}`).emit('circuit_draw:verified', {
        userId: player.userId, name: player.displayName, correct: true, feedback: player.feedback, newKttx,
      });
    } else {
      getIo()?.to(`game:${room.roomCode}`).emit('circuit_draw:verified', {
        userId: player.userId, name: player.displayName, correct: false, feedback: player.feedback,
      });
    }
    broadcastLeaderboard(room);
  });
}
