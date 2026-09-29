import type { Request, Response } from 'express';
import { SESSION_COOKIE_SECURE } from '../config.js';

export const SESSION_COOKIE_NAME = 'smartlecture_session';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const key = item.slice(0, separator).trim();
    if (key !== name) continue;
    const value = item.slice(separator + 1).trim();
    try { return decodeURIComponent(value); } catch { return null; }
  }
  return null;
}

export function getSessionCookie(req: Request): string | null {
  return readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
}

export function getSessionCookieFromHeader(cookieHeader: string | undefined): string | null {
  return readCookie(cookieHeader, SESSION_COOKIE_NAME);
}

export function hasSessionCookie(req: Request): boolean {
  return getSessionCookie(req) !== null;
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: SESSION_COOKIE_SECURE,
    sameSite: 'strict',
    path: '/',
  });
}
