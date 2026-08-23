import { useAuthStore } from '../stores/authStore';
import type { ApiErrorBody } from '../types';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = `Lỗi máy chủ (${res.status})`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body?.error) {
        code = body.error.code;
        message = body.error.message;
      }
    } catch {
      /* giữ message mặc định */
    }
    if (res.status === 401) useAuthStore.getState().clearAuth();
    throw new ApiError(res.status, code, message);
  }
  return (await res.json()) as T;
}
