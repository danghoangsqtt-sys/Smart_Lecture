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
