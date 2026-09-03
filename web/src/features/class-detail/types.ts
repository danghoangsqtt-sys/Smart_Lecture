export interface DashboardData {
  classInfo: { id: string; name: string; subject: string; academicYear: string };
  counts: { students: number; lectures: number; materials: number; exams: number; games: number; attendanceSessions: number };
  attendance: { sessions: number; present: number; absent: number; periodsAbsent: number; attendanceRate: number };
  grades: { avgKttx: number; avgProcess1: number; avgFinal: number; gradedCount: number; totalStudents: number };
  progress: { totalLessons: number; completedLessons: number; percent: number; totalPeriods: number; estimatedPeriodsDone: number };
  recentActivity: { type: string; title: string; date: string }[];
}

export interface StudentProfile {
  id: string;
  username: string;
  displayName: string;
  status: string;
  studentCode: string | null;
  dob: string | null;
  gender: string | null;
  hometown: string | null;
}

export interface StudentLite {
  id: string;
  username: string;
  displayName: string;
}

export interface AttendanceSessionInfo {
  id: string;
  date: string;
  periodsTotal: number;
  note: string;
  teachingType: string;
  remark: string;
  absentCount?: number;
}

export interface AttendanceRecordRow {
  studentId: string;
  displayName: string;
  status: string | null;
  periodsAbsent: number;
  reason: string;
}

export interface GradeRow {
  studentId: string;
  displayName: string;
  kttx: number | null;
  process1: number | null;
  finalExam: number | null;
  remark: string;
  presentCount: number;
  absentCount: number;
  periodsAbsent: number;
}

export interface Group {
  id: string;
  name: string;
  color: string;
  members: StudentLite[];
}

export interface ClassMeta { id: string; name: string; subject: string; teacherId: string; academicYear: string; archived: boolean; studentCount: number; lectureCount: number; totalPeriods: number }
export interface ClassSettings { kttxWeight: number; process1Weight: number; finalExamWeight: number; defaultGamePoints: number; gamePointsCap: number; autoCreateGroups: boolean; groupCount: number }
export interface Subject { id: string; name: string; sortOrder: number }
export interface Lecture { id: string; classId: string; subjectId: string | null; chapter: string; title: string; description: string; sortOrder: number; completedAt: string | null; materials: unknown[] }
