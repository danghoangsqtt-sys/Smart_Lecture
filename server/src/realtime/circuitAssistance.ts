import type { Server as IOServer, Socket } from 'socket.io';

import { db } from '../db/connection.js';
import type { RoomState } from './gameTypes.js';

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

export function createCircuitAssistance({
  getIo,
  circuitHostRoom,
}: {
  getIo: () => IOServer | null;
  circuitHostRoom: (room: RoomState) => string;
}) {
  const circuitAssistanceStatus = (row: CircuitAssistanceRow): CircuitAssistanceStatus => {
    if (row.acknowledged_at !== null) return 'acknowledged';
    if (row.delivered_at !== null) return 'delivered';
    return 'queued';
  };

  const circuitAssistancePayload = (row: CircuitAssistanceRow) => ({
    messageId: row.message_id,
    kind: row.kind,
    message: row.message,
    teacherName: row.teacher_name,
    sentAt: row.sent_at,
  });

  const circuitAssistanceStatusPayload = (room: RoomState, row: CircuitAssistanceRow) => {
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
  };

  const getCircuitAssistance = (sessionId: string, userId: string): CircuitAssistanceRow | undefined =>
    db.prepare(`
      SELECT game_session_id, student_id, message_id, kind, message, teacher_name,
             sent_at, delivered_at, acknowledged_at
      FROM game_circuit_assistance
      WHERE game_session_id = ? AND student_id = ?
    `).get(sessionId, userId) as CircuitAssistanceRow | undefined;

  const circuitAssistanceSnapshot = (room: RoomState) => {
    const rows = db.prepare(`
      SELECT game_session_id, student_id, message_id, kind, message, teacher_name,
             sent_at, delivered_at, acknowledged_at
      FROM game_circuit_assistance
      WHERE game_session_id = ?
      ORDER BY sent_at DESC, student_id
    `).all(room.sessionId) as unknown as CircuitAssistanceRow[];
    return rows.map((row) => circuitAssistanceStatusPayload(room, row));
  };

  const markCircuitAssistanceDelivered = (room: RoomState, row: CircuitAssistanceRow, deliveredAt: number): CircuitAssistanceRow => {
    db.prepare(`
      UPDATE game_circuit_assistance
      SET delivered_at = COALESCE(delivered_at, ?), updated_at = datetime('now')
      WHERE game_session_id = ? AND student_id = ? AND message_id = ? AND acknowledged_at IS NULL
    `).run(deliveredAt, room.sessionId, row.student_id, row.message_id);
    return getCircuitAssistance(room.sessionId, row.student_id) ?? row;
  };

  const emitCircuitAssistanceStatus = (room: RoomState, row: CircuitAssistanceRow): void => {
    getIo()?.to(circuitHostRoom(room)).emit(
      'circuit_simulate:teacher-message-status',
      circuitAssistanceStatusPayload(room, row),
    );
  };

  const deliverPendingCircuitAssistance = (room: RoomState, socket: Socket, userId: string): void => {
    const row = getCircuitAssistance(room.sessionId, userId);
    if (!row || row.acknowledged_at !== null || socket.data.circuitAssistanceMessageId === row.message_id) return;
    socket.data.circuitAssistanceMessageId = row.message_id;
    socket.emit('circuit_simulate:teacher-message', circuitAssistancePayload(row));
    emitCircuitAssistanceStatus(room, markCircuitAssistanceDelivered(room, row, Date.now()));
  };

  return {
    circuitAssistanceStatus,
    circuitAssistanceSnapshot,
    getCircuitAssistance,
    markCircuitAssistanceDelivered,
    emitCircuitAssistanceStatus,
    deliverPendingCircuitAssistance,
  };
}
