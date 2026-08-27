import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { db, tx } from '../db/connection.js';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js';
import { HttpError, h } from '../utils/errors.js';
import { canManageClass, getClassOrThrow } from '../utils/access.js';

const router = Router();
router.use(requireAuth);
router.use(requireRole('teacher', 'admin'));

interface EventRow {
  id: string;
  teacher_id: string;
  class_id: string | null;
  title: string;
  event_type: string;
  room: string;
  start_at: string;
  end_at: string;
  note: string;
  recurrence_id: string | null;
}

interface ConflictInfo {
  id: string;
  title: string;
  teacherName: string;
  startAt: string;
  endAt: string;
}

function getEventOrThrow(id: string): EventRow {
  const row = db.prepare('SELECT * FROM schedule_events WHERE id = ?').get(id) as EventRow | undefined;
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy sự kiện');
  return row;
}

function canManageEvent(event: EventRow, user: NonNullable<AuthedRequest['user']>): boolean {
  return user.role === 'admin' || event.teacher_id === user.id;
}

function findConflicts(room: string, startAt: string, endAt: string, excludeId: string): ConflictInfo[] {
  if (!room.trim()) return [];
  return db
    .prepare(
      `SELECT se.id, se.title, se.start_at AS startAt, se.end_at AS endAt, u.display_name AS teacherName
       FROM schedule_events se JOIN users u ON u.id = se.teacher_id
       WHERE se.room = ? AND se.id != ? AND se.start_at < ? AND se.end_at > ?`
    )
    .all(room, excludeId, endAt, startAt) as unknown as ConflictInfo[];
}

router.get(
  '/events',
  h(async (req, res) => {
    const user = (req as AuthedRequest).user!;
    const start = String(req.query.start ?? '');
    const end = String(req.query.end ?? '');
    if (!start || !end) throw new HttpError(400, 'BAD_INPUT', 'Thiếu khoảng thời gian start/end');
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const wantsAll = req.query.scope === 'all' && user.role === 'admin';

    let sql = `SELECT se.*, u.display_name AS teacher_name FROM schedule_events se JOIN users u ON u.id = se.teacher_id WHERE se.start_at < ? AND se.end_at > ?`;
    const params: string[] = [end, start];
    if (!wantsAll) {
      sql += ' AND se.teacher_id = ?';
      params.push(user.id);
    }
    if (classId) {
      sql += ' AND se.class_id = ?';
      params.push(classId);
    }
    sql += ' ORDER BY se.start_at';
    const rows = db.prepare(sql).all(...params) as unknown as (EventRow & { teacher_name: string })[];
    res.json({
      events: rows.map((r) => ({
        id: r.id,
        teacherId: r.teacher_id,
        teacherName: r.teacher_name,
        classId: r.class_id,
        title: r.title,
        eventType: r.event_type,
        room: r.room,
        startAt: r.start_at,
        endAt: r.end_at,
        note: r.note,
        recurrenceId: r.recurrence_id,
      })),
    });
  })
);

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  eventType: z.enum(['class', 'meeting', 'other']).default('class'),
  room: z.string().max(100).default(''),
  classId: z.string().nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  note: z.string().max(1000).default(''),
});

router.post(
  '/events',
  h(async (req, res) => {
    const user = (req as AuthedRequest).user!;
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
    if (parsed.data.startAt >= parsed.data.endAt) throw new HttpError(400, 'BAD_INPUT', 'Giờ kết thúc phải sau giờ bắt đầu');
    if (parsed.data.classId) {
      const cls = getClassOrThrow(parsed.data.classId);
      if (!canManageClass(cls, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với lớp này');
    }
    const id = randomUUID();
    db.prepare(
      `INSERT INTO schedule_events (id, teacher_id, class_id, title, event_type, room, start_at, end_at, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      user.id,
      parsed.data.classId ?? null,
      parsed.data.title,
      parsed.data.eventType,
      parsed.data.room,
      parsed.data.startAt,
      parsed.data.endAt,
      parsed.data.note
    );
    const conflicts = findConflicts(parsed.data.room, parsed.data.startAt, parsed.data.endAt, id);
    res.status(201).json({ id, conflicts });
  })
);

const recurringSchema = z.object({
  title: z.string().min(1).max(200),
  eventType: z.enum(['class', 'meeting', 'other']).default('class'),
  room: z.string().max(100).default(''),
  classId: z.string().nullable().optional(),
  note: z.string().max(1000).default(''),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

router.post(
  '/events/recurring',
  h(async (req, res) => {
    const user = (req as AuthedRequest).user!;
    const parsed = recurringSchema.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
    const { startDate, endDate, daysOfWeek, startTime, endTime } = parsed.data;
    if (startTime >= endTime) throw new HttpError(400, 'BAD_INPUT', 'Giờ kết thúc phải sau giờ bắt đầu');
    if (startDate > endDate) throw new HttpError(400, 'BAD_INPUT', 'Ngày kết thúc phải sau ngày bắt đầu');
    if (parsed.data.classId) {
      const cls = getClassOrThrow(parsed.data.classId);
      if (!canManageClass(cls, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với lớp này');
    }

    const dayset = new Set(daysOfWeek);
    const dates: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00`);
    const last = new Date(`${endDate}T00:00:00`);
    while (cursor <= last && dates.length < 300) {
      if (dayset.has(cursor.getDay())) {
        dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (dates.length === 0) throw new HttpError(400, 'BAD_INPUT', 'Không có buổi nào trong khoảng đã chọn');

    const recurrenceId = randomUUID();
    const insert = db.prepare(
      `INSERT INTO schedule_events (id, teacher_id, class_id, title, event_type, room, start_at, end_at, note, recurrence_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const conflicts: ConflictInfo[] = [];
    tx(() => {
      for (const date of dates) {
        const id = randomUUID();
        const startAt = `${date}T${startTime}:00`;
        const endAt = `${date}T${endTime}:00`;
        insert.run(
          id,
          user.id,
          parsed.data.classId ?? null,
          parsed.data.title,
          parsed.data.eventType,
          parsed.data.room,
          startAt,
          endAt,
          parsed.data.note,
          recurrenceId
        );
        conflicts.push(...findConflicts(parsed.data.room, startAt, endAt, id));
      }
    });
    res.status(201).json({ createdCount: dates.length, recurrenceId, conflicts });
  })
);

router.patch(
  '/events/:id',
  h(async (req, res) => {
    const event = getEventOrThrow(String(req.params.id));
    const user = (req as AuthedRequest).user!;
    if (!canManageEvent(event, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền sửa sự kiện này');
    const parsed = eventSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'BAD_INPUT', 'Dữ liệu không hợp lệ');
    if (parsed.data.classId) {
      const cls = getClassOrThrow(parsed.data.classId);
      if (!canManageClass(cls, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền với lớp này');
    }
    const title = parsed.data.title ?? event.title;
    const eventType = parsed.data.eventType ?? event.event_type;
    const room = parsed.data.room ?? event.room;
    const startAt = parsed.data.startAt ?? event.start_at;
    const endAt = parsed.data.endAt ?? event.end_at;
    const note = parsed.data.note ?? event.note;
    const classId = parsed.data.classId !== undefined ? parsed.data.classId : event.class_id;
    if (startAt >= endAt) throw new HttpError(400, 'BAD_INPUT', 'Giờ kết thúc phải sau giờ bắt đầu');
    db.prepare('UPDATE schedule_events SET title=?, event_type=?, room=?, start_at=?, end_at=?, note=?, class_id=? WHERE id=?').run(
      title,
      eventType,
      room,
      startAt,
      endAt,
      note,
      classId,
      event.id
    );
    const conflicts = findConflicts(room, startAt, endAt, event.id);
    res.json({ ok: true, conflicts });
  })
);

router.delete(
  '/events/:id',
  h(async (req, res) => {
    const event = getEventOrThrow(String(req.params.id));
    const user = (req as AuthedRequest).user!;
    if (!canManageEvent(event, user)) throw new HttpError(403, 'FORBIDDEN', 'Không có quyền xóa sự kiện này');
    db.prepare('DELETE FROM schedule_events WHERE id = ?').run(event.id);
    res.json({ ok: true });
  })
);

export default router;
