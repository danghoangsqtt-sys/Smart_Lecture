import type { Server as IOServer, Socket } from 'socket.io';

import { zCwTry, zUserId, zVerdict } from './gameSchemas.js';
import type { RoomState } from './gameTypes.js';

export function registerRoomInteractionHandlers(socket: Socket, {
  getRoom,
  getIo,
  getSocketIds,
  getDisplayName,
  isRoomHost,
  applyCorrectPoints,
  broadcastLeaderboard,
  broadcastRace,
  broadcastHands,
  emitCrosswordState,
  finishGame,
}: {
  getRoom: () => RoomState | undefined;
  getIo: () => IOServer | null;
  getSocketIds: (roomCode: string) => string[];
  getDisplayName: (userId: string) => string;
  isRoomHost: (room: RoomState | undefined, socket: Socket) => room is RoomState;
  applyCorrectPoints: (room: RoomState, userId: string, name: string) => number;
  broadcastLeaderboard: (room: RoomState) => void;
  broadcastRace: (room: RoomState) => void;
  broadcastHands: (room: RoomState) => void;
  emitCrosswordState: (room: RoomState, target?: Socket) => void;
  finishGame: (room: RoomState) => void;
}): void {
  socket.on('hr:hand', () => {
    if (socket.data.role !== 'student') return;
    const room = getRoom();
    if (!room || !('hands' in room)) return;
    if (room.gameType !== 'hand_raise' && room.gameType !== 'crossword') return;
    if (room.phase !== 'question' && room.phase !== 'crossword') return;
    if (room.activePick) return;
    const userId = String(socket.data.userId);
    const name = getDisplayName(userId);
    if (room.hands.has(userId)) room.hands.delete(userId);
    else room.hands.set(userId, name);
    broadcastHands(room);
  });

  socket.on('game:host-pick', (raw: unknown) => {
    const parsed = zUserId.safeParse(raw);
    if (!parsed.success || socket.data.role === 'student') return;
    const room = getRoom();
    if (!isRoomHost(room, socket) || room.activePick) return;
    const target = room.players.get(parsed.data.userId);
    const raceTarget = room.racePlayers.get(parsed.data.userId);
    const name = target?.displayName ?? raceTarget?.displayName ?? room.hands.get(parsed.data.userId) ?? 'Học viên';
    room.activePick = { userId: parsed.data.userId, name };
    getIo()?.to(`game:${room.roomCode}`).emit('hr:selected', { userId: parsed.data.userId, name });
    const pickedSocket = getSocketIds(room.roomCode)
      .map((id) => getIo()?.sockets.sockets.get(id))
      .find((candidate) => candidate && candidate.data.role === 'student' && candidate.data.userId === parsed.data.userId);
    pickedSocket?.emit('hr:you-picked', { gameType: room.gameType });
  });

  socket.on('game:host-release', () => {
    const room = getRoom();
    if (!isRoomHost(room, socket)) return;
    room.activePick = null;
    getIo()?.to(`game:${room.roomCode}`).emit('hr:released');
  });

  socket.on('game:host-verdict', (raw: unknown) => {
    const parsed = zVerdict.safeParse(raw);
    if (!parsed.success || socket.data.role === 'student') return;
    const room = getRoom();
    if (!isRoomHost(room, socket) || !room.activePick) return;
    const { userId, correct } = parsed.data;
    const player = room.players.get(userId);
    const racePlayer = room.racePlayers.get(userId);
    const name = player?.displayName ?? racePlayer?.displayName ?? room.activePick.name;

    let newTotal: number | null = null;
    if (correct) newTotal = applyCorrectPoints(room, userId, name);

    getIo()?.to(`game:${room.roomCode}`).emit('hr:result', {
      name,
      correct,
      delta: correct ? room.pointsPerCorrect : 0,
      newKttx: newTotal,
    });
    broadcastLeaderboard(room);

    room.activePick = null;
    room.hands.delete(userId);
    getIo()?.to(`game:${room.roomCode}`).emit('hr:released');
    broadcastHands(room);

    if (room.gameType === 'crossword' && room.solvedRows.size >= (room.puzzle?.rows.length ?? Infinity)) finishGame(room);
  });

  socket.on('game:host-kick', (raw: unknown) => {
    const parsed = zUserId.safeParse(raw);
    if (!parsed.success || socket.data.role === 'student') return;
    const room = getRoom();
    if (!isRoomHost(room, socket)) return;
    const targetId = parsed.data.userId;
    room.blacklist.add(targetId);
    room.players.delete(targetId);
    room.racePlayers.delete(targetId);
    room.hands.delete(targetId);
    if (room.activePick?.userId === targetId) {
      room.activePick = null;
      getIo()?.to(`game:${room.roomCode}`).emit('hr:released');
    }
    for (const sid of getSocketIds(room.roomCode)) {
      const targetSocket = getIo()?.sockets.sockets.get(sid);
      if (targetSocket && targetSocket.data.role === 'student' && targetSocket.data.userId === targetId) {
        targetSocket.emit('you-kicked', { message: 'Bạn đã bị giáo viên loại khỏi trò chơi.' });
        targetSocket.leave(`game:${room.roomCode}`);
        targetSocket.disconnect(true);
      }
    }
    broadcastHands(room);
    broadcastLeaderboard(room);
    broadcastRace(room);
    getIo()?.to(`game:${room.roomCode}`).emit('lobby:update', {
      count: [...room.players.values()].filter((player) => player.online).length,
      players: [...room.players.values()].map((player) => ({ name: player.displayName, team: player.team, userId: player.userId })),
    });
  });

  socket.on('cw:try', (raw: unknown) => {
    const parsed = zCwTry.safeParse(raw);
    if (!parsed.success || socket.data.role !== 'student') return;
    const room = getRoom();
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
      getIo()?.to(`game:${room.roomCode}`).emit('cw:solved', {
        rowIndex,
        name: room.activePick.name,
        delta: room.pointsPerCorrect,
        newKttx,
      });
      emitCrosswordState(room);
      broadcastLeaderboard(room);
      room.activePick = null;
      getIo()?.to(`game:${room.roomCode}`).emit('hr:released');
      if (room.solvedRows.size >= room.puzzle.rows.length) finishGame(room);
    } else {
      socket.emit('cw:wrong', { rowIndex });
    }
  });
}
