import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

type AsyncHandler = (req: Request, res: Response) => unknown;

export function h(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    const oversized = err.code === 'LIMIT_FILE_SIZE';
    res.status(oversized ? 413 : 400).json({
      error: {
        code: oversized ? 'UPLOAD_TOO_LARGE' : 'INVALID_UPLOAD',
        message: oversized ? 'Tệp tải lên vượt quá giới hạn' : 'Dữ liệu tải lên không hợp lệ',
      },
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'BAD_INPUT', message: err.issues[0]?.message ?? 'Dữ liệu không hợp lệ' },
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { code: 'BAD_JSON', message: 'Nội dung JSON không hợp lệ' } });
    return;
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Lỗi hệ thống không xác định' } });
}
