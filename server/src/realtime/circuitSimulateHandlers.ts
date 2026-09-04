import { randomUUID } from 'node:crypto';
import type { Server as IOServer, Socket } from 'socket.io';

import { db, getUserById, toPublicUser } from '../db/connection.js';
import { circuitValidationResult } from './circuitTopology.js';
import { zCircuitDraw, zCircuitHostControl, zCircuitInspect, zCircuitMeasurements, zCircuitSimulate, zCircuitTeacherMessage, zCircuitTeacherMessageAck } from './gameSchemas.js';
import type { CircuitHostControlAction } from './gameSchemas.js';
import type { CircuitChallenge, CircuitSimulatePlayer, RoomState } from './gameTypes.js';

type CircuitAssistance = {
  game_session_id: string;
  student_id: string;
  message_id: string;
  kind: 'hint' | 'retry';
  message: string;
  teacher_name: string;
  sent_at: number;
  delivered_at: number | null;
  acknowledged_at: number | null;
};

export function registerCircuitSimulateHandlers(socket: Socket, {
  getRoom,
  getIo,
  getSocketIds,
  subscribeInspection,
  isRoomHost,
  controlChallenge,
  getCircuitAssistance,
  markCircuitAssistanceDelivered,
  emitCircuitAssistanceStatus,
  circuitAssistanceStatus,
  completeCircuitChallenge,
  persistCircuitPlayer,
  emitProgress,
  emitInspectionUpdate,
  broadcastLeaderboard,
  circuitSimulateInspection,
}: {
  getRoom: () => RoomState | undefined;
  getIo: () => IOServer | null;
  getSocketIds: (roomCode: string) => string[];
  subscribeInspection: (socketId: string, roomCode: string, userId: string) => void;
  isRoomHost: (room: RoomState | undefined, socket: Socket) => room is RoomState;
  controlChallenge: (room: RoomState, action: CircuitHostControlAction) => void;
  getCircuitAssistance: (sessionId: string, userId: string) => CircuitAssistance | undefined;
  markCircuitAssistanceDelivered: (room: RoomState, row: CircuitAssistance, deliveredAt: number) => CircuitAssistance;
  emitCircuitAssistanceStatus: (room: RoomState, row: CircuitAssistance) => void;
  circuitAssistanceStatus: (row: CircuitAssistance) => 'queued' | 'delivered' | 'acknowledged';
  completeCircuitChallenge: (room: RoomState, player: CircuitSimulatePlayer, challenge: CircuitChallenge) => number | null;
  persistCircuitPlayer: (room: RoomState, player: CircuitSimulatePlayer) => void;
  emitProgress: (room: RoomState, player: CircuitSimulatePlayer) => void;
  emitInspectionUpdate: (room: RoomState, player: CircuitSimulatePlayer) => void;
  broadcastLeaderboard: (room: RoomState) => void;
  circuitSimulateInspection: (room: RoomState, player: CircuitSimulatePlayer) => unknown;
}): void {
  socket.on('circuit_simulate:host-control', (raw: unknown) => {
    const parsed = zCircuitHostControl.safeParse(raw);
    if (!parsed.success || socket.data.role === 'student') return;
    const room = getRoom();
    if (!isRoomHost(room, socket) || room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
    controlChallenge(room, parsed.data.action);
  });

  socket.on('circuit_simulate:inspect', (raw: unknown) => {
    const parsed = zCircuitInspect.safeParse(raw);
    if (!parsed.success || socket.data.role === 'student') return;
    const room = getRoom();
    if (!isRoomHost(room, socket) || room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
    const player = room.circuitSimulatePlayers.get(parsed.data.userId);
    if (!player) {
      socket.emit('game:error', { message: 'Không tìm thấy trạng thái mạch của học viên.' });
      return;
    }
    subscribeInspection(socket.id, room.roomCode, player.userId);
    socket.emit('circuit_simulate:inspection', circuitSimulateInspection(room, player));
  });

  socket.on('circuit_simulate:teacher-message', (raw: unknown) => {
    const parsed = zCircuitTeacherMessage.safeParse(raw);
    if (!parsed.success || socket.data.role === 'student') return;
    const room = getRoom();
    if (!isRoomHost(room, socket) || room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
    const player = room.circuitSimulatePlayers.get(parsed.data.userId);
    if (!player) {
      socket.emit('game:error', { message: 'Không tìm thấy học viên để hỗ trợ.' });
      return;
    }
    const message = parsed.data.kind === 'hint'
      ? (parsed.data.message ?? '').trim()
      : (parsed.data.message ?? '').trim() || 'Giáo viên đề nghị bạn kiểm tra lại mạch và nộp lại khi sẵn sàng.';
    if (!message) {
      socket.emit('game:error', { message: 'Vui lòng nhập nội dung gợi ý.' });
      return;
    }
    const teacher = getUserById(String(socket.data.userId));
    const teacherName = teacher ? toPublicUser(teacher).displayName : 'Giáo viên';
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
    const learnerSockets = getSocketIds(room.roomCode)
      .map((socketId) => getIo()?.sockets.sockets.get(socketId))
      .filter((candidate): candidate is Socket => (
        candidate?.data.role === 'student' && String(candidate.data.userId) === player.userId
      ));
    for (const learnerSocket of learnerSockets) {
      learnerSocket.data.circuitAssistanceMessageId = messageId;
      learnerSocket.emit('circuit_simulate:teacher-message', payload);
    }
    let assistance = getCircuitAssistance(room.sessionId, player.userId);
    if (!assistance) return;
    if (learnerSockets.length > 0) assistance = markCircuitAssistanceDelivered(room, assistance, Date.now());
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
    const room = getRoom();
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
    const parsed = zCircuitDraw.safeParse(raw);
    if (!parsed.success || socket.data.role !== 'student') return;
    const room = getRoom();
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
      getIo()?.to(`game:${room.roomCode}`).emit('circuit_simulate:challenge_passed', {
        userId: player.userId,
        name: player.displayName,
        challengeId: challenge.id,
        points: challenge.points,
        newKttx: newKttx ?? 0,
      });
      broadcastLeaderboard(room);
    }
    persistCircuitPlayer(room, player);
    emitProgress(room, player);
    emitInspectionUpdate(room, player);
  });

  socket.on('circuit_simulate:measurements', (raw: unknown) => {
    const parsed = zCircuitMeasurements.safeParse(raw);
    if (!parsed.success || socket.data.role !== 'student') return;
    const room = getRoom();
    if (!room || room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
    const player = room.circuitSimulatePlayers.get(String(socket.data.userId));
    if (!player) return;
    player.measurements = parsed.data.measurements;
    player.lastActivityAt = Date.now();
    persistCircuitPlayer(room, player);
    emitProgress(room, player);
    emitInspectionUpdate(room, player);
  });

  socket.on('circuit_simulate:simulate', (raw: unknown) => {
    const parsed = zCircuitSimulate.safeParse(raw);
    if (!parsed.success || socket.data.role !== 'student') return;
    const room = getRoom();
    if (!room || room.gameType !== 'circuit_simulate' || room.phase !== 'circuit_simulate') return;
    const player = room.circuitSimulatePlayers.get(String(socket.data.userId));
    if (!player) return;
    player.simulationState = parsed.data.action;
    player.lastActivityAt = Date.now();
    persistCircuitPlayer(room, player);
    emitProgress(room, player);
    emitInspectionUpdate(room, player);
    socket.emit('circuit_simulate:simulation_state', {
      state: parsed.data.action,
      timeStep: parsed.data.timeStep ?? 0.001,
    });
  });
}
