export interface PublicUser {
  id: string;
  username: string;
  role: 'admin' | 'teacher' | 'student';
  displayName: string;
  status: string;
  mustChangePassword: boolean;
  studentCode: string | null;
  dob: string | null;
  gender: string | null;
  hometown: string | null;
}

export interface RosterPreviewRow {
  row: number;
  username: string;
  displayName: string;
  studentCode: string;
  action: 'create' | 'enroll' | 'skip' | 'conflict';
  message: string;
}

export interface RosterPreview {
  classId: string;
  className: string;
  summary: { create: number; enroll: number; skip: number; conflict: number };
  rows: RosterPreviewRow[];
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface ScheduleEvent {
  id: string;
  teacherId: string;
  teacherName: string;
  classId: string | null;
  title: string;
  eventType: 'class' | 'meeting' | 'other';
  room: string;
  startAt: string;
  endAt: string;
  note: string;
  recurrenceId: string | null;
}
