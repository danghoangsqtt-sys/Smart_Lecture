import type { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import { getUserById } from '../db/connection.js';
import { getSessionCookieFromHeader } from '../auth/sessionCookie.js';

export interface SocketPayload { userId: string; role: string }

export function authenticateSocket(socket: Socket): SocketPayload | null {
  const bearerToken = socket.handshake.auth?.token;
  const token = typeof bearerToken === 'string'
    ? bearerToken
    : getSessionCookieFromHeader(socket.request.headers.cookie) ?? undefined;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub?: string; sv?: number };
    if (typeof payload.sub !== 'string' || !Number.isInteger(payload.sv)) return null;
    const user = getUserById(payload.sub);
    if (!user || user.status === 'locked' || user.must_change_password === 1 || user.session_version !== payload.sv) return null;
    return { userId: user.id, role: user.role };
  } catch {
    return null;
  }
}
