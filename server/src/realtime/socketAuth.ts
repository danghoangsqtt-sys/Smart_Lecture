import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import { getUserById } from '../db/connection.js';

export interface SocketPayload { userId: string; role: string }

export function authenticateSocket(socket: Socket): SocketPayload | null {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const user = getUserById(payload.sub);
    if (!user || user.status === 'locked' || user.must_change_password === 1) return null;
    return { userId: user.id, role: user.role };
  } catch {
    return null;
  }
}
