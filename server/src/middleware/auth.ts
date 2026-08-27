import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';
import { getUserById, toPublicUser } from '../db/connection.js';

export interface AuthedRequest extends Request {
  user?: ReturnType<typeof toPublicUser>;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Thiếu token xác thực' } });
    return;
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { sub: string };
    const row = getUserById(payload.sub);
    if (!row || row.status === 'locked') {
      res.status(401).json({ error: { code: 'INVALID_USER', message: 'Tài khoản không hợp lệ hoặc đã bị khóa' } });
      return;
    }
    req.user = toPublicUser(row);
    next();
  } catch {
    res.status(401).json({ error: { code: 'BAD_TOKEN', message: 'Token không hợp lệ hoặc hết hạn' } });
  }
}

export function requireAuthFlexible(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : typeof req.query.token === 'string' ? req.query.token : null;
  if (!token) {
    res.status(401).json({ error: { code: 'NO_TOKEN', message: 'Thiếu token xác thực' } });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    const row = getUserById(payload.sub);
    if (!row || row.status === 'locked') {
      res.status(401).json({ error: { code: 'INVALID_USER', message: 'Tài khoản không hợp lệ hoặc đã bị khóa' } });
      return;
    }
    req.user = toPublicUser(row);
    next();
  } catch {
    res.status(401).json({ error: { code: 'BAD_TOKEN', message: 'Token không hợp lệ hoặc hết hạn' } });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { code: 'NO_AUTH', message: 'Chưa đăng nhập' } });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Không có quyền thực hiện' } });
      return;
    }
    next();
  };
}
