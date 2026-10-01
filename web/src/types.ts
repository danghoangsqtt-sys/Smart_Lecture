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

export interface SharedSubject {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface SharedLesson {
  id: string;
  subject_id: string;
  chapter: string;
  title: string;
  description: string;
  sort_order: number;
  created_at: string;
}

export interface SharedClassSubject extends SharedSubject {
  assignment_id: string;
}

export interface SharedMaterial {
  id: string;
  lesson_id: string;
  type: 'pdf' | 'docx' | 'pptx' | 'video' | 'image' | 'link';
  title: string;
  link_url: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  asset_status: 'pending_copy' | 'ready';
}

export interface SharedQuestion {
  link_id: string;
  id: string;
  content: string;
  type: 'mcq' | 'essay' | 'fill';
  sort_order: number;
}

export interface SharedLessonProgress {
  lesson_id: string;
  title: string;
  chapter: string;
  sort_order: number;
  progress_id: string | null;
  planned_periods: number | null;
  completed_periods: number | null;
  status: 'pending' | 'in_progress' | 'completed' | null;
}
