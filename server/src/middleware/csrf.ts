import type { NextFunction, Request, Response } from 'express';
import { hasSessionCookie } from '../auth/sessionCookie.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originMatchesHost(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { return new URL(origin).hostname.toLowerCase() === req.hostname.toLowerCase(); }
  catch { return false; }
}

export function rejectCrossHostOriginWhenPresent(req: Request, res: Response, next: NextFunction): void {
  if (!req.headers.origin || originMatchesHost(req)) {
    next();
    return;
  }
  res.status(403).json({ error: { code: 'CSRF_ORIGIN', message: 'Nguồn yêu cầu không hợp lệ' } });
}

export function requireSameHostCookieOrigin(req: Request, res: Response, next: NextFunction): void {
  // Login does not consume the existing session cookie. Its route-level guard
  // rejects a cross-host Origin while still allowing cookie-jar API clients to
  // switch accounts without manufacturing a browser Origin header.
  if (req.path === '/auth/login' || SAFE_METHODS.has(req.method) || req.headers.authorization?.startsWith('Bearer ') || !hasSessionCookie(req)) {
    next();
    return;
  }

  if (!originMatchesHost(req)) {
    res.status(403).json({ error: { code: 'CSRF_ORIGIN', message: 'Nguồn yêu cầu không hợp lệ' } });
    return;
  }
  next();
}
