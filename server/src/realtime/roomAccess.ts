import type { Socket } from 'socket.io';

import { db } from '../db/connection.js';
import type { RoomState } from './gameTypes.js';

export function isRoomHost(room: RoomState | undefined, socket: Socket): room is RoomState {
  return !!room && socket.data.role !== 'student' && room.hostId === String(socket.data.userId);
}

export function isEnrolled(classId: string | null, userId: string): boolean {
  if (!classId) return false;
  return !!db.prepare('SELECT 1 FROM enrollments WHERE class_id = ? AND student_id = ?').get(classId, userId);
}

export function addKttx(classId: string | null, userId: string, delta: number): number {
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
