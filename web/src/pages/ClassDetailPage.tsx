import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, Spinner, Textarea } from '../components/ui';
import { StudentProfileModal } from '../components/StudentProfileFields';
import toast from '../stores/toastStore';
import { toISODate } from '../lib/dateUtils';
import { useFieldReducer } from '../hooks/useFieldReducer';

async function downloadExcelWorkbook(filename: string, sheetName: string, rows: Array<Array<string | number>>) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRows(rows);
  const blob = new Blob([await workbook.xlsx.writeBuffer()], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

interface ClassMeta {
  id: string;
  name: string;
  subject: string;
  teacherId: string;
  academicYear: string;
  archived: boolean;
  studentCount: number;
  lectureCount: number;
  totalPeriods: number;
}

interface StudentProfile {
  id: string;
  username: string;
  displayName: string;
  status: string;
  studentCode: string | null;
  dob: string | null;
  gender: string | null;
  hometown: string | null;
}

interface StudentLite {
  id: string;
  username: string;
  displayName: string;
}

interface Group {
  id: string;
  name: string;
  color: string;
  members: StudentLite[];
}

interface ClassSettings {
  kttxWeight: number;
  process1Weight: number;
  finalExamWeight: number;
  defaultGamePoints: number;
  gamePointsCap: number;
  autoCreateGroups: boolean;
  groupCount: number;
}

interface DashboardData {
  classInfo: { id: string; name: string; subject: string; academicYear: string };
  counts: { students: number; lectures: number; materials: number; exams: number; games: number; attendanceSessions: number };
  attendance: { sessions: number; present: number; absent: number; periodsAbsent: number; attendanceRate: number };
  grades: { avgKttx: number; avgProcess1: number; avgFinal: number; gradedCount: number; totalStudents: number };
  progress: { totalLessons: number; completedLessons: number; percent: number; totalPeriods: number; estimatedPeriodsDone: number };
  recentActivity: { type: string; title: string; date: string }[];
}

interface Lecture {
  id: string;
  classId: string;
  subjectId: string | null;
  chapter: string;
  title: string;
  description: string;
  sortOrder: number;
  completedAt: string | null;
  materials: unknown[];
}

interface Subject {
  id: string;
  name: string;
  sortOrder: number;
}

interface AttendanceSessionInfo {
  id: string;
  date: string;
  periodsTotal: number;
  note: string;
  teachingType: string;
  remark: string;
  absentCount?: number;
}
interface AttendanceRecordRow { studentId: string; displayName: string; status: string | null; periodsAbsent: number; reason: string }
interface GradeRow {
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

const TEACHING_TYPES = ['Lý thuyết', 'Thực hành', 'Bài tập', 'Ôn tập', 'Kiểm tra', 'Thảo luận/Xemina', 'Trực tuyến'];

const TABS = ['overview', 'students', 'attendance', 'gradebook', 'groups', 'settings'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Tổng quan',
  students: 'Học viên',
  attendance: 'Điểm danh',
  gradebook: 'Sổ điểm',
  groups: 'Nhóm',
  settings: 'Cài đặt',
};

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const classId = id ?? '';
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'overview';
  const user = useAuthStore((s) => s.user);

  const [cls, setCls] = useState<ClassMeta | null>(null);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [subjectCount, setSubjectCount] = useState(1);
  const [loading, setLoading] = useState(true);

  const canManage = !!cls && !!user && (user.role === 'admin' || (user.role === 'teacher' && cls.teacherId === user.id));

  const loadDetail = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const detail = await api<{ class: ClassMeta; students: StudentProfile[] }>(`/classes/${classId}`);
      setCls(detail.class);
      setStudents(detail.students);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải lớp học');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  useEffect(() => {
    if (!classId) return;
    api<{ subjects: { id: string }[] }>(`/classes/${classId}/subjects`)
      .then((res) => setSubjectCount(res.subjects.length))
      .catch(() => {});
  }, [classId]);

  function setTab(tab: Tab) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  }

  if (loading) return <Spinner />;
  if (!cls) return <Card><EmptyState message="Không tìm thấy lớp học hoặc bạn không có quyền xem" /></Card>;

  return (
    <div>
      <PageHeader
        title={cls.name}
        subtitle={`${subjectCount > 1 ? `${subjectCount} môn học` : cls.subject || 'Không phân môn'}${cls.academicYear ? ` · ${cls.academicYear}` : ''}${cls.archived ? ' · ĐÃ LƯU TRỮ' : ''}`}
        actions={<Link to="/classes"><Button variant="secondary">← Danh sách lớp</Button></Link>}
      />
      <div className="mb-5 flex flex-wrap border-b border-slate-200" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setTab(tab)}
            className={`px-4 py-2 text-sm font-semibold uppercase tracking-wider transition border-b-2 -mb-px ${
              activeTab === tab ? 'border-blue-900 text-blue-900' : 'border-transparent text-slate-500 hover:text-blue-900'
            }`}
          >
            {TAB_LABELS[tab]} {tab === 'students' && <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-900">{students.length}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab classId={classId} />}
      {activeTab === 'students' && <StudentsTab classId={classId} students={students} canManage={canManage} onChanged={loadDetail} />}
      {activeTab === 'attendance' && <AttendanceTab classId={classId} canManage={canManage} />}
      {activeTab === 'gradebook' && <GradebookTab classId={classId} canManage={canManage} />}
      {activeTab === 'groups' && <GroupsTab classId={classId} students={students} canManage={canManage} />}
      {activeTab === 'settings' && <SettingsTab classId={classId} cls={cls} canManage={canManage} onSaved={loadDetail} />}
    </div>
  );
}

function OverviewTab({ classId }: { classId: string }) {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<DashboardData>(`/classes/${classId}/dashboard`)
      .then(setDashboard)
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Lỗi tải tổng quan'))
      .finally(() => setLoading(false));
  }, [classId]);

  async function exportExcel() {
    if (!dashboard) return;
    const token = useAuthStore.getState().token;
    const res = await fetch(`/api/classes/${classId}/export/xlsx`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Không thể xuất Excel (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dashboard.classInfo.name}-danh-sach-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <Spinner />;
  if (!dashboard) return <p className="text-sm text-slate-500">Không tải được dữ liệu.</p>;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500 p-4"><p className="text-sm text-slate-500">Học viên</p><p className="text-2xl font-bold text-blue-900">{dashboard.counts.students}</p></Card>
        <Card className="border-l-4 border-l-emerald-500 p-4"><p className="text-sm text-slate-500">Bài giảng</p><p className="text-2xl font-bold text-emerald-900">{dashboard.counts.lectures}</p></Card>
        <Card className="border-l-4 border-l-amber-500 p-4"><p className="text-sm text-slate-500">Tài liệu</p><p className="text-2xl font-bold text-amber-900">{dashboard.counts.materials}</p></Card>
        <Card className="border-l-4 border-l-purple-500 p-4"><p className="text-sm text-slate-500">Đề thi</p><p className="text-2xl font-bold text-purple-900">{dashboard.counts.exams}</p></Card>
        <Card className="border-l-4 border-l-pink-500 p-4"><p className="text-sm text-slate-500">Game</p><p className="text-2xl font-bold text-pink-900">{dashboard.counts.games}</p></Card>
        <Card className="border-l-4 border-l-cyan-500 p-4"><p className="text-sm text-slate-500">Buổi điểm danh</p><p className="text-2xl font-bold text-cyan-900">{dashboard.counts.attendanceSessions}</p></Card>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <h4 className="mb-3 font-semibold text-slate-700">Điểm danh</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Buổi học</span><span className="font-bold">{dashboard.attendance.sessions}</span></div>
            <div className="flex justify-between text-green-700"><span>Có mặt</span><span className="font-bold">{dashboard.attendance.present}</span></div>
            <div className="flex justify-between text-red-700"><span>Vắng</span><span className="font-bold">{dashboard.attendance.absent}</span></div>
            <div className="flex justify-between"><span>Tiết vắng</span><span className="font-bold">{dashboard.attendance.periodsAbsent}</span></div>
            <div className="flex justify-between border-t pt-2"><span>Tỷ lệ có mặt</span><span className="font-bold text-blue-900">{dashboard.attendance.attendanceRate}%</span></div>
          </div>
        </Card>
        <Card className="p-4">
          <h4 className="mb-3 font-semibold text-slate-700">Điểm số (TB)</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>KTTX</span><span className="font-bold">{dashboard.grades.avgKttx.toFixed(1)}</span></div>
            <div className="flex justify-between"><span>Quá trình 1</span><span className="font-bold">{dashboard.grades.avgProcess1.toFixed(1)}</span></div>
            <div className="flex justify-between"><span>Cuối kỳ</span><span className="font-bold">{dashboard.grades.avgFinal.toFixed(1)}</span></div>
            <div className="flex justify-between border-t pt-2"><span>Đã chấm</span><span className="font-bold">{dashboard.grades.gradedCount}/{dashboard.grades.totalStudents}</span></div>
          </div>
        </Card>
        <Card className="p-4">
          <h4 className="mb-3 font-semibold text-slate-700">Tiến độ học tập</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Bài đã dạy</span><span className="font-bold">{dashboard.progress.completedLessons}/{dashboard.progress.totalLessons}</span></div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-blue-900" style={{ width: `${dashboard.progress.percent}%` }} />
            </div>
            <div className="flex justify-between border-t pt-2"><span>Hoàn thành</span><span className="font-bold text-blue-900">{dashboard.progress.percent}%</span></div>
            {dashboard.progress.totalPeriods > 0 && (
              <div className="flex justify-between text-slate-500"><span>Ước tính số tiết</span><span className="font-semibold">{dashboard.progress.estimatedPeriodsDone}/{dashboard.progress.totalPeriods}</span></div>
            )}
          </div>
        </Card>
        <Card className="p-4">
          <h4 className="mb-3 font-semibold text-slate-700">Hoạt động gần đây</h4>
          {dashboard.recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500">Chưa có hoạt động</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {dashboard.recentActivity.slice(0, 5).map((activity) => (
                <li key={`${activity.type}:${activity.date}:${activity.title}`} className="flex justify-between text-slate-600">
                  <span className="truncate pr-2">{activity.type === 'lecture' ? '📖' : activity.type === 'exam' ? '📝' : activity.type === 'game' ? '🎮' : '📅'} {activity.title}</span>
                  <span className="text-xs text-slate-400">{new Date(activity.date).toLocaleDateString('vi-VN')}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Link to="/games" state={{ classId }}>
          <Button><i className="fas fa-gamepad" /> Tạo hoạt động cho lớp</Button>
        </Link>
        <Button variant="secondary" onClick={() => void exportExcel()}>Xuất danh sách Excel</Button>
      </div>
    </div>
  );
}

function StudentsTab({ classId, students, canManage, onChanged }: { classId: string; students: StudentProfile[]; canManage: boolean; onChanged: () => Promise<void> }) {
  const [eligible, setEligible] = useState<StudentLite[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentProfile | null>(null);

  const loadEligible = useCallback(async () => {
    if (!canManage) return;
    try {
      const res = await api<{ students: StudentLite[] }>(`/classes/${classId}/eligible-students`);
      setEligible(res.students);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải danh sách');
    }
  }, [classId, canManage]);

  useEffect(() => { void loadEligible(); }, [loadEligible]);

  async function addSelected() {
    if (selected.size === 0) return;
    try {
      await api(`/classes/${classId}/enroll`, { method: 'POST', body: JSON.stringify({ studentIds: [...selected] }) });
      toast.success(`Đã thêm ${selected.size} học viên`);
      setSelected(new Set());
      await onChanged();
      await loadEligible();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi thêm học viên');
    }
  }

  async function removeStudent(sid: string) {
    try {
      await api(`/classes/${classId}/enroll/${sid}`, { method: 'DELETE' });
      await onChanged();
      await loadEligible();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-600">Đã trong lớp ({students.length})</h4>
          {canManage && <Button variant="secondary" className="!py-1.5 !px-3 text-xs" onClick={() => setImportOpen(true)}>Nhập từ Excel/CSV</Button>}
        </div>
        {students.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có học viên nào.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-sm border border-slate-200">
            {students.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <span>{s.displayName} <span className="ml-1 font-mono text-xs text-slate-500">{s.username}</span></span>
                  <div className="mt-0.5 space-x-2 text-xs text-slate-400">
                    {s.studentCode && <span>Mã: {s.studentCode}</span>}
                    {s.dob && <span>Sinh: {s.dob}</span>}
                    {s.gender && <span>{s.gender}</span>}
                    {s.hometown && <span>{s.hometown}</span>}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-3">
                    <button onClick={() => setEditingStudent(s)} className="text-xs font-semibold text-blue-700 hover:text-blue-900">Sửa hồ sơ</button>
                    <button onClick={() => void removeStudent(s.id)} className="text-xs font-semibold text-red-600 hover:text-red-700">Xóa khỏi lớp</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {canManage && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-600">Thêm từ danh sách ({eligible.length})</h4>
          {eligible.length === 0 ? (
            <p className="text-sm text-slate-500">Tất cả học viên đã ở trong lớp.</p>
          ) : (
            <>
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-sm border border-slate-200 p-2">
                {eligible.map((s) => (
                  <li key={s.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={(e) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(s.id);
                            else next.delete(s.id);
                            return next;
                          })
                        }
                      />
                      {s.displayName} <span className="font-mono text-xs text-slate-500">{s.username}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex justify-end">
                <Button onClick={() => void addSelected()} disabled={selected.size === 0}>Thêm {selected.size > 0 ? `(${selected.size})` : ''}</Button>
              </div>
            </>
          )}
        </section>
      )}
      {importOpen && (
        <ImportStudentsModal
          classId={classId}
          onClose={() => setImportOpen(false)}
          onImported={async () => {
            await onChanged();
            await loadEligible();
          }}
        />
      )}
      {editingStudent && <StudentProfileModal student={editingStudent} onClose={() => setEditingStudent(null)} onSaved={() => void onChanged()} />}
    </div>
  );
}

function ImportStudentsModal({ classId, onClose, onImported }: { classId: string; onClose: () => void; onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  async function downloadTemplate() {
    setDownloadingTemplate(true);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/classes/${classId}/import-template.xlsx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Tải file mẫu thất bại');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mau-nhap-hoc-vien-${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải file mẫu');
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/classes/${classId}/import-students`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Import failed');
      const data = await res.json();
      toast.success(`Đã tạo ${data.created} tài khoản mới, thêm ${data.enrolled} vào lớp (bỏ qua ${data.skipped})`);
      if (data.errors.length) toast.error(data.errors.slice(0, 5).join('; '));
      onClose();
      await onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi import');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Nhập học viên từ Excel/CSV" wide>
      <p className="mb-4 text-sm text-slate-500">
        File cần đủ 9 cột theo thứ tự: <strong>STT, Mã học viên, Họ và tên, Ngày tháng năm sinh, Giới tính, Lớp, Quê quán, Tài khoản user, Mật khẩu mặc định</strong>.
        Bắt buộc có <strong>Tài khoản user</strong> và <strong>Họ và tên</strong>; các cột còn lại có thể để trống.
        Mật khẩu bỏ trống sẽ mặc định bằng tài khoản; học viên có thể tự đổi sau khi đăng nhập.
        Cột Lớp chỉ dùng để đối chiếu — nếu khác tên lớp hiện tại vẫn nhập bình thường nhưng sẽ có cảnh báo.
      </p>
      <div className="mb-4">
        <Button variant="secondary" onClick={() => void downloadTemplate()} disabled={downloadingTemplate}>
          <i className="fas fa-file-excel" /> {downloadingTemplate ? 'Đang tải…' : 'Tải file mẫu Excel'}
        </Button>
      </div>
      <input
        aria-label="Chọn file danh sách học viên"
        type="file"
        accept=".csv,.xlsx"
        onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        className="mb-4 block w-full text-sm text-slate-600 file:mr-3 file:rounded-sm file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-700"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
        <Button onClick={() => void submit()} disabled={busy || !file}>{busy ? 'Đang nhập…' : 'Nhập học viên'}</Button>
      </div>
    </Modal>
  );
}

function AttendanceTab({ classId, canManage }: { classId: string; canManage: boolean }) {
  const [sessions, setSessions] = useState<AttendanceSessionInfo[]>([]);
  const [openSession, setOpenSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ sessions: AttendanceSessionInfo[] }>(`/classes/${classId}/attendance/sessions`);
      setSessions(res.sessions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setCreateOpen(true)}><i className="fas fa-plus" /> Buổi học</Button>
        </div>
      )}
      {loading ? (
        <Spinner />
      ) : sessions.length === 0 ? (
        <Card><EmptyState message="Chưa có buổi học nào." /></Card>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenSession(s.id)}
              className="flex w-full flex-wrap items-center gap-3 rounded-sm border border-slate-300 bg-white px-4 py-3 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
            >
              <span className="font-mono text-lg font-semibold text-blue-900">
                {new Date(s.date + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
              </span>
              <span className="text-sm text-slate-500">{s.periodsTotal} tiết</span>
              {s.teachingType && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800">{s.teachingType}</span>}
              {s.note && <span className="max-w-[240px] truncate text-sm text-slate-500">{s.note}</span>}
              {(s.absentCount ?? 0) > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">{s.absentCount} vắng</span>}
              <span className="ml-auto text-xs font-semibold text-blue-700">{canManage ? 'Điểm danh' : 'Xem'} <i className="fas fa-arrow-right" /></span>
            </button>
          ))}
        </div>
      )}
      {canManage && createOpen && <CreateSessionModal classId={classId} onClose={() => setCreateOpen(false)} onCreated={loadSessions} />}
      {openSession && <MarkModal sessionId={openSession} canManage={canManage} onClose={() => setOpenSession(null)} onSaved={loadSessions} />}
    </div>
  );
}

function CreateSessionModal({
  classId,
  initialTeachingPlanItemId,
  onClose,
  onCreated,
}: {
  classId: string;
  initialTeachingPlanItemId?: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const today = toISODate(new Date());
  const [date, setDate] = useState(today);
  const [periods, setPeriods] = useState(1);
  const [teachingType, setTeachingType] = useState(TEACHING_TYPES[0]!);
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api(`/classes/${classId}/attendance/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          date,
          periodsTotal: periods,
          teachingType,
          note: content,
          teachingPlanItemId: initialTeachingPlanItemId ?? undefined,
        }),
      });
      toast.success('Đã tạo buổi học');
      onClose();
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Buổi học mới">
      <div className="space-y-3">
        <div><Label>Ngày</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label>Số tiết</Label><Input type="number" min={1} max={12} value={periods} onChange={(e) => setPeriods(Number(e.target.value))} /></div>
        <div>
          <Label>Loại hình giảng dạy</Label>
          <Select value={teachingType} onChange={(e) => setTeachingType(e.target.value)}>
            {TEACHING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div><Label>Nội dung giảng dạy</Label><Textarea rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="VD: Bài 4 - Luyện tập" /></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy}>Tạo</Button></div>
      </div>
    </Modal>
  );
}

function MarkModal({ sessionId, canManage, onClose, onSaved }: { sessionId: string; canManage: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [state, setField] = useFieldReducer(() => ({
    session: null as AttendanceSessionInfo | null,
    records: [] as AttendanceRecordRow[],
    teachingType: TEACHING_TYPES[0]!,
    content: '',
    remark: '',
    loading: true,
    saving: false,
  }));
  const { session, records, teachingType, content, remark, loading, saving } = state;

  useEffect(() => {
    setField('loading', true);
    api<{ session: AttendanceSessionInfo; records: AttendanceRecordRow[] }>(`/attendance/sessions/${sessionId}`)
      .then((r) => {
        setField('session', r.session);
        setField('records', r.records);
        setField('teachingType', r.session.teachingType || TEACHING_TYPES[0]!);
        setField('content', r.session.note);
        setField('remark', r.session.remark);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Lỗi'))
      .finally(() => setField('loading', false));
  }, [sessionId, setField]);

  function toggleAbsent(idx: number, absent: boolean) {
    setField('records', (rs) =>
      rs.map((r, i) =>
        i === idx
          ? { ...r, status: absent ? 'absent' : 'present', periodsAbsent: absent ? (r.periodsAbsent || session?.periodsTotal || 1) : 0, reason: absent ? r.reason : '' }
          : r
      )
    );
  }

  async function save() {
    setField('saving', true);
    try {
      await Promise.all([
        api(`/attendance/sessions/${sessionId}/records`, {
          method: 'PUT',
          body: JSON.stringify({
            records: records.map((r) => ({
              studentId: r.studentId,
              status: r.status === 'absent' ? 'absent' : 'present',
              periodsAbsent: r.status === 'absent' ? r.periodsAbsent : 0,
              reason: r.status === 'absent' ? r.reason : '',
            })),
          }),
        }),
        api(`/attendance/sessions/${sessionId}`, {
          method: 'PATCH',
          body: JSON.stringify({ teachingType, note: content, remark }),
        }),
      ]);
      toast.success('Đã lưu điểm danh');
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setField('saving', false);
    }
  }

  const total = records.length;
  const absentCount = records.filter((r) => r.status === 'absent').length;
  const presentCount = total - absentCount;

  return (
    <Modal open onClose={onClose} title={canManage ? 'Điểm danh buổi học' : 'Xem điểm danh buổi học'} wide>
      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {canManage ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Loại hình giảng dạy</Label>
                <Select value={teachingType} onChange={(e) => setField('teachingType', e.target.value)}>
                  {TEACHING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Nội dung giảng dạy</Label>
                <Textarea rows={2} value={content} onChange={(e) => setField('content', e.target.value)} placeholder="Nội dung đã giảng dạy trong buổi học…" />
              </div>
            </div>
          ) : (
            (session?.teachingType || session?.note) && (
              <div className="space-y-1 text-sm text-slate-600">
                {session?.teachingType && <p><span className="font-semibold text-slate-700">Loại hình:</span> {session.teachingType}</p>}
                {session?.note && <p><span className="font-semibold text-slate-700">Nội dung:</span> {session.note}</p>}
              </div>
            )
          )}

          <div className="flex items-center gap-4 rounded-sm border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
            <span>Sĩ số: <strong>{total}</strong></span>
            <span className="text-emerald-700">Có mặt: <strong>{presentCount}</strong></span>
            <span className="text-red-700">Vắng: <strong>{absentCount}</strong></span>
          </div>

          <ul className="max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
            {records.map((r, idx) => {
              const absent = r.status === 'absent';
              return (
                <li key={r.studentId} className={`rounded-sm border px-3 py-2 ${absent ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-36 flex-1 text-sm">{r.displayName}</span>
                    {canManage ? (
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-red-700">
                        <input
                          type="checkbox"
                          checked={absent}
                          onChange={(e) => toggleAbsent(idx, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-red-600"
                        />
                        Vắng
                      </label>
                    ) : (
                      <span className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${absent ? 'bg-red-100 text-red-800' : r.status === 'present' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                        {absent ? 'Vắng' : r.status === 'present' ? 'Có mặt' : 'Chưa điểm danh'}
                      </span>
                    )}
                    {canManage && absent && (
                      <input
                        aria-label={`Số tiết vắng của ${r.displayName}`}
                        type="number" min={1} max={12} value={r.periodsAbsent || ''} placeholder="tiết"
                        onChange={(e) => setField('records', (rs) => rs.map((x, i) => (i === idx ? { ...x, periodsAbsent: Number(e.target.value) } : x)))}
                        className="w-16 rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                      />
                    )}
                    {!canManage && absent && r.periodsAbsent > 0 && <span className="text-xs text-slate-500">{r.periodsAbsent} tiết</span>}
                  </div>
                  {canManage && absent && (
                    <Input
                      value={r.reason}
                      placeholder="Lý do vắng…"
                      onChange={(e) => setField('records', (rs) => rs.map((x, i) => (i === idx ? { ...x, reason: e.target.value } : x)))}
                      className="mt-2"
                    />
                  )}
                  {!canManage && absent && r.reason && <p className="mt-1.5 text-xs text-slate-500">Lý do: {r.reason}</p>}
                </li>
              );
            })}
          </ul>

          {canManage ? (
            <div>
              <Label>Nhận xét buổi học</Label>
              <Textarea rows={3} value={remark} onChange={(e) => setField('remark', e.target.value)} placeholder="Nhận xét chung về buổi học…" />
            </div>
          ) : (
            session?.remark && (
              <div className="rounded-sm border border-slate-200 bg-slate-50 p-3 text-sm">
                <span className="font-semibold text-slate-700">Nhận xét buổi học:</span> <span className="text-slate-600">{session.remark}</span>
              </div>
            )
          )}

          {canManage && (
            <div className="flex justify-end">
              <Button onClick={() => void save()} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu điểm danh'}</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function GradebookTab({ classId, canManage }: { classId: string; canManage: boolean }) {
  const [info, setInfo] = useState<{ name: string; sessionTotal: number } | null>(null);
  const [rows, setRows] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarkFor, setRemarkFor] = useState<GradeRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ classInfo: { name: string; sessionTotal: number }; rows: GradeRow[] }>(`/classes/${classId}/gradebook`);
      setInfo(res.classInfo);
      setRows(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  async function update(studentId: string, col: 'kttx' | 'process1' | 'finalExam', value: string) {
    const num = value === '' ? null : Math.min(10, Math.max(0, Number(value)));
    if (value !== '' && Number.isNaN(num as number)) return;
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, [col]: num } : r)));
    try {
      await api(`/classes/${classId}/grades/${studentId}`, { method: 'PUT', body: JSON.stringify({ [col]: num }) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu điểm');
      await load();
    }
  }

  async function exportExcel() {
    if (!info) return;
    const aoa = [
      [`SỔ ĐIỂM — ${info.name}`],
      [],
      ['STT', 'Họ tên', 'KTTX', 'Quá trình 1', 'KT kết thúc môn', `Buổi học (${info.sessionTotal})`, 'Đi học', 'Vắng', 'Tiết vắng', 'Nhận xét'],
      ...rows.map((r, i) => [i + 1, r.displayName, r.kttx ?? '', r.process1 ?? '', r.finalExam ?? '', info.sessionTotal, r.presentCount, r.absentCount, r.periodsAbsent, r.remark]),
    ];
    await downloadExcelWorkbook(`so-diem-${Date.now()}.xlsx`, 'Sổ điểm', aoa);
    toast.success('Đã xuất Excel');
  }

  if (loading) return <Spinner />;
  if (rows.length === 0) return <Card><EmptyState message="Lớp chưa có học viên" /></Card>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" onClick={() => void exportExcel()}><i className="fas fa-download" /> Excel</Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Họ tên</th>
              <th className="px-4 py-3">KTTX</th>
              <th className="px-4 py-3">Quá trình 1</th>
              <th className="px-4 py-3">KT cuối môn</th>
              <th className="px-4 py-3 text-center" colSpan={3}>Chuyên cần ({info?.sessionTotal ?? 0} buổi)</th>
              <th className="px-4 py-3">Nhận xét</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((r, i) => (
              <tr key={r.studentId} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                <td className="px-4 py-2">{r.displayName}</td>
                {(['kttx', 'process1', 'finalExam'] as const).map((col) => (
                  <td key={col} className="px-4 py-2">
                    {canManage ? (
                      <input
                        aria-label={`Điểm ${col} của ${r.displayName}`}
                        type="number" min={0} max={10} step={0.25}
                        value={r[col] ?? ''}
                        placeholder="—"
                        onChange={(e) => void update(r.studentId, col, e.target.value)}
                        className="w-16 rounded-sm border border-slate-300 bg-white px-2 py-1 text-center text-sm text-slate-800 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                      />
                    ) : (
                      <span className="font-semibold">{r[col] ?? '—'}</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-2 text-center text-emerald-700">{r.presentCount}</td>
                <td className="px-4 py-2 text-center text-red-600">{r.absentCount}</td>
                <td className="px-4 py-2 text-center text-red-500">{r.periodsAbsent} tiết</td>
                <td className="px-4 py-2 max-w-[180px]">
                  {canManage ? (
                    <button onClick={() => setRemarkFor(r)} className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs font-medium text-slate-600 hover:bg-slate-100">
                      <i className={`fas ${r.remark ? 'fa-comment text-blue-900' : 'fa-comment-slash text-slate-400'}`} />
                      <span className="truncate">{r.remark || 'Thêm nhận xét'}</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-600">{r.remark || '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {remarkFor && (
        <RemarkModal
          row={remarkFor}
          classId={classId}
          onClose={() => setRemarkFor(null)}
          onSaved={(text) => setRows((rs) => rs.map((r) => (r.studentId === remarkFor.studentId ? { ...r, remark: text } : r)))}
        />
      )}
    </div>
  );
}

type RemarkRow = GradeRow | GroupGradeRow;

function isGroupRow(row: RemarkRow): row is GroupGradeRow {
  return 'groupId' in row;
}

function RemarkModal({ row, classId, onClose, onSaved }: { row: RemarkRow; classId: string; onClose: () => void; onSaved: (text: string) => void }) {
  const [text, setText] = useState(row.remark);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const rowIsGroup = isGroupRow(row);

  async function aiSuggest() {
    if (rowIsGroup) return;
    setBusy(true);
    try {
      const res = await api<{ comment: string }>('/ai/comment-gradebook', {
        method: 'POST',
        body: JSON.stringify({
          studentName: row.displayName,
          kttx: row.kttx,
          process1: row.process1,
          finalExam: row.finalExam,
          presentCount: 'presentCount' in row ? row.presentCount : 0,
          absentCount: 'absentCount' in row ? row.absentCount : 0,
        }),
      });
      setText(res.comment);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi AI');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      if (rowIsGroup) {
        await api(`/classes/${classId}/group-grades/${row.groupId}`, { method: 'PUT', body: JSON.stringify({ remark: text }) });
      } else {
        await api(`/classes/${classId}/grades/${row.studentId}`, { method: 'PUT', body: JSON.stringify({ remark: text }) });
      }
      onSaved(text);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu nhận xét');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Nhận xét — ${rowIsGroup ? row.groupName : row.displayName}`}>
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhận xét…" />
      <div className="mt-3 flex justify-between">
        {!rowIsGroup && <Button variant="secondary" onClick={() => void aiSuggest()} disabled={busy}>
          <i className="fas fa-robot" /> {busy ? 'Đang tạo…' : 'AI gợi ý'}
        </Button>}
        <Button onClick={() => void save()} disabled={saving}>Lưu</Button>
      </div>
    </Modal>
  );
}

function GroupsTab({ classId, students, canManage }: { classId: string; students: StudentProfile[]; canManage: boolean }) {
  const [view, setView] = useState<'groups' | 'scores'>('groups');
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#3b82f6');

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ groups: Group[] }>(`/classes/${classId}/groups`);
      setGroups(res.groups);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void loadGroups(); }, [loadGroups]);

  async function createGroup() {
    if (!newGroupName.trim()) return;
    try {
      await api(`/classes/${classId}/groups`, { method: 'POST', body: JSON.stringify({ name: newGroupName, color: newGroupColor }) });
      toast.success('Đã tạo nhóm');
      setNewGroupName('');
      setCreateOpen(false);
      await loadGroups();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function deleteGroup(gid: string) {
    if (!window.confirm('Xóa nhóm này?')) return;
    try {
      await api(`/classes/${classId}/groups/${gid}`, { method: 'DELETE' });
      toast.success('Đã xóa nhóm');
      await loadGroups();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function addGroupMembers(gid: string, studentIds: string[]) {
    if (studentIds.length === 0) {
      toast.error('Tất cả học viên đã có nhóm');
      return;
    }
    try {
      const res = await api<{ added: number }>(`/classes/${classId}/groups/${gid}/members`, { method: 'POST', body: JSON.stringify({ studentIds }) });
      toast.success(`Đã thêm ${res.added} học viên vào nhóm`);
      await loadGroups();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function removeGroupMember(gid: string, sid: string) {
    try {
      await api(`/classes/${classId}/groups/${gid}/members/${sid}`, { method: 'DELETE' });
      toast.success('Đã xóa khỏi nhóm');
      await loadGroups();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function autoAssignGroups() {
    if (!window.confirm('Phân chia tự động tất cả học viên vào các nhóm hiện có?')) return;
    try {
      const res = await api<{ assigned: number }>(`/classes/${classId}/groups/auto-assign`, { method: 'POST' });
      toast.success(`Đã phân chia ${res.assigned} học viên`);
      await loadGroups();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-sm border border-slate-300 bg-slate-50 p-1 text-sm font-semibold w-fit">
        <button
          onClick={() => setView('groups')}
          className={`rounded-sm px-3 py-1.5 transition ${view === 'groups' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
        >
          Nhóm
        </button>
        <button
          onClick={() => setView('scores')}
          className={`rounded-sm px-3 py-1.5 transition ${view === 'scores' ? 'bg-blue-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
        >
          Điểm nhóm
        </button>
      </div>
      {view === 'scores' ? (
        <GroupScoresSection classId={classId} canManage={canManage} />
      ) : (
        <>
      {canManage && (
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-slate-700">Nhóm học tập / Đội thi</h4>
          <div className="flex gap-2">
            <Button variant="secondary" className="!py-1.5" onClick={() => setCreateOpen(true)}>+ Tạo nhóm</Button>
            <Button variant="secondary" className="!py-1.5" onClick={() => setImportOpen(true)}><i className="fas fa-file-excel" /> Nhập nhóm từ Excel</Button>
            {groups.length > 0 && <Button variant="secondary" className="!py-1.5" onClick={() => void autoAssignGroups()}>Phân chia tự động</Button>}
          </div>
        </div>
      )}
      {groups.length === 0 ? (
        <Card className="p-6 text-center"><EmptyState message="Chưa có nhóm nào. Tạo nhóm để phân chia học viên cho trò chơi kéo co, làm việc nhóm..." /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.id} className="rounded-sm border border-slate-300 bg-white p-4" style={{ borderLeft: `4px solid ${g.color}` }}>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800" style={{ color: g.color }}>{g.name}</h4>
                {canManage && <Button variant="ghost" className="!p-1 text-red-600" onClick={() => void deleteGroup(g.id)} title="Xóa nhóm">✕</Button>}
              </div>
              <p className="mt-2 text-sm text-slate-500">{g.members.length} thành viên</p>
              {g.members.length > 0 && (
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-slate-600">
                  {g.members.slice(0, 10).map((m) => (
                    <li key={m.id} className="flex justify-between">
                      <span>{m.displayName} <span className="font-mono text-slate-400">{m.username}</span></span>
                      {canManage && <button aria-label={`Xóa ${m.displayName} khỏi nhóm`} onClick={() => void removeGroupMember(g.id, m.id)} className="text-red-500 hover:text-red-700">×</button>}
                    </li>
                  ))}
                  {g.members.length > 10 && <li className="text-slate-400">... và {g.members.length - 10} người khác</li>}
                </ul>
              )}
              {canManage && (
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 !py-1.5 text-xs"
                    onClick={() => {
                      const groupedIds = new Set(groups.flatMap((gr) => gr.members.map((m) => m.id)));
                      const withoutGroup = students.flatMap((student) => groupedIds.has(student.id) ? [] : [student.id]);
                      void addGroupMembers(g.id, withoutGroup);
                    }}
                  >
                    Thêm HV chưa có nhóm
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {canManage && createOpen && (
        <CreateGroupModal
          onClose={() => setCreateOpen(false)}
          name={newGroupName}
          setName={setNewGroupName}
          color={newGroupColor}
          setColor={setNewGroupColor}
          onCreate={() => void createGroup()}
        />
      )}
      {canManage && importOpen && (
        <ImportGroupsModal classId={classId} onClose={() => setImportOpen(false)} onImported={loadGroups} />
      )}
        </>
      )}
    </div>
  );
}

function ImportGroupsModal({ classId, onClose, onImported }: { classId: string; onClose: () => void; onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  async function downloadTemplate() {
    setDownloadingTemplate(true);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/classes/${classId}/groups-template.xlsx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Tải file mẫu thất bại');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mau-nhap-nhom-${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải file mẫu');
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/classes/${classId}/import-groups`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Import failed');
      const data = await res.json();
      toast.success(`Đã tạo ${data.groupsCreated} nhóm mới, thêm ${data.added} thành viên (bỏ qua ${data.skipped})`);
      if (data.errors.length) toast.error(data.errors.slice(0, 5).join('; '));
      onClose();
      await onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi import');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Nhập nhóm từ Excel" wide>
      <p className="mb-4 text-sm text-slate-500">
        File cần có cột <strong>Tên nhóm</strong> và <strong>Tài khoản user</strong> — tài khoản phải đã được ghi danh vào lớp này.
        Tên nhóm chưa tồn tại sẽ tự động được tạo mới.
      </p>
      <div className="mb-4">
        <Button variant="secondary" onClick={() => void downloadTemplate()} disabled={downloadingTemplate}>
          <i className="fas fa-file-excel" /> {downloadingTemplate ? 'Đang tải…' : 'Tải file mẫu Excel'}
        </Button>
      </div>
      <input
        aria-label="Chọn file danh sách nhóm"
        type="file"
        accept=".csv,.xlsx"
        onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        className="mb-4 block w-full text-sm text-slate-600 file:mr-3 file:rounded-sm file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-700"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
        <Button onClick={() => void submit()} disabled={busy || !file}>{busy ? 'Đang nhập…' : 'Nhập nhóm'}</Button>
      </div>
    </Modal>
  );
}

function CreateGroupModal({ onClose, name, setName, color, setColor, onCreate }: { onClose: () => void; name: string; setName: (v: string) => void; color: string; setColor: (v: string) => void; onCreate: () => void }) {
  return (
    <Modal open onClose={onClose} title="Tạo nhóm mới">
      <div className="space-y-3">
        <div><Label>Tên nhóm *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Đội A, Nhóm 1..." /></div>
        <div><Label>Màu sắc</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-10 cursor-pointer rounded-sm border border-slate-300" /></div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={onCreate} disabled={!name.trim()}>Tạo nhóm</Button>
        </div>
      </div>
    </Modal>
  );
}

function SettingsTab({ classId, cls, canManage, onSaved }: { classId: string; cls: ClassMeta; canManage: boolean; onSaved: () => Promise<void> }) {
  const [settings, setSettings] = useState<ClassSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [periodsOpen, setPeriodsOpen] = useState(false);
  const [periodsValue, setPeriodsValue] = useState(cls.totalPeriods);
  const [savingPeriods, setSavingPeriods] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ settings: ClassSettings }>(`/classes/${classId}/settings`);
      setSettings(res.settings);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void loadSettings(); }, [loadSettings]);
  useEffect(() => { setPeriodsValue(cls.totalPeriods); }, [cls.totalPeriods]);

  async function saveSettings(next: ClassSettings) {
    try {
      await api(`/classes/${classId}/settings`, { method: 'PUT', body: JSON.stringify(next) });
      toast.success('Đã lưu cài đặt');
      setSettings(next);
      setSettingsOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function saveTotalPeriods() {
    setSavingPeriods(true);
    try {
      await api(`/classes/${classId}`, { method: 'PATCH', body: JSON.stringify({ totalPeriods: periodsValue }) });
      toast.success('Đã lưu tổng số tiết');
      setPeriodsOpen(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setSavingPeriods(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-slate-700">Cài đặt chấm điểm & Game</h4>
        {canManage && settings && <Button variant="secondary" className="!py-1.5" onClick={() => setSettingsOpen(true)}>Sửa</Button>}
      </div>
      {loading || !settings ? (
        <p className="text-sm text-slate-500">Đang tải...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <h5 className="mb-2 text-sm font-semibold text-slate-600">Trọng số điểm</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>KTTX</span><span className="font-bold text-blue-900">{Math.round(settings.kttxWeight * 100)}%</span></div>
              <div className="flex justify-between"><span>Quá trình 1</span><span className="font-bold text-blue-900">{Math.round(settings.process1Weight * 100)}%</span></div>
              <div className="flex justify-between"><span>Cuối kỳ</span><span className="font-bold text-blue-900">{Math.round(settings.finalExamWeight * 100)}%</span></div>
            </div>
          </Card>
          <Card className="p-4">
            <h5 className="mb-2 text-sm font-semibold text-slate-600">Cài đặt Game</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Điểm mặc định / câu đúng</span><span className="font-bold">{settings.defaultGamePoints}</span></div>
              <div className="flex justify-between"><span>Giới hạn KTTX từ game</span><span className="font-bold">{settings.gamePointsCap}</span></div>
            </div>
          </Card>
          <Card className="p-4">
            <h5 className="mb-2 text-sm font-semibold text-slate-600">Nhóm tự động</h5>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Tự tạo nhóm</span><span className="font-bold">{settings.autoCreateGroups ? 'Bật' : 'Tắt'}</span></div>
              <div className="flex justify-between"><span>Số nhóm mặc định</span><span className="font-bold">{settings.groupCount}</span></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h5 className="text-sm font-semibold text-slate-600">Tổng số tiết</h5>
              {canManage && <button onClick={() => setPeriodsOpen(true)} className="text-xs font-semibold text-blue-700 hover:text-blue-900">Sửa</button>}
            </div>
            <p className="text-2xl font-bold text-blue-900">{cls.totalPeriods}</p>
            <p className="text-xs text-slate-400">Dùng để ước tính số tiết đã dạy ở tab Tiến độ</p>
          </Card>
        </div>
      )}
      {settingsOpen && settings && <SettingsModal onClose={() => setSettingsOpen(false)} settings={settings} onSave={saveSettings} />}
      {periodsOpen && (
        <Modal open onClose={() => setPeriodsOpen(false)} title="Tổng số tiết">
          <div className="space-y-3">
            <div><Label>Tổng số tiết của môn học</Label><Input type="number" min={0} max={999} value={periodsValue} onChange={(e) => setPeriodsValue(Number(e.target.value))} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setPeriodsOpen(false)} disabled={savingPeriods}>Hủy</Button>
              <Button onClick={() => void saveTotalPeriods()} disabled={savingPeriods}>Lưu</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SettingsModal({ onClose, settings, onSave }: { onClose: () => void; settings: ClassSettings; onSave: (s: ClassSettings) => void }) {
  const [localSettings, setLocalSettings] = useState<ClassSettings>(settings);
  const totalWeight = Math.round((localSettings.kttxWeight + localSettings.process1Weight + localSettings.finalExamWeight) * 100);

  function update<K extends keyof ClassSettings>(key: K, value: ClassSettings[K]) {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <Modal open onClose={onClose} title="Cài đặt lớp học" wide>
      <div className="space-y-4">
        <div className="border-b pb-4">
          <h5 className="mb-3 font-semibold text-slate-700">Trọng số điểm (tổng = 100%)</h5>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>KTTX (%)</Label><Input type="number" min={0} max={100} value={Math.round(localSettings.kttxWeight * 100)} onChange={(e) => update('kttxWeight', Number(e.target.value) / 100)} /></div>
            <div><Label>Quá trình 1 (%)</Label><Input type="number" min={0} max={100} value={Math.round(localSettings.process1Weight * 100)} onChange={(e) => update('process1Weight', Number(e.target.value) / 100)} /></div>
            <div><Label>Cuối kỳ (%)</Label><Input type="number" min={0} max={100} value={Math.round(localSettings.finalExamWeight * 100)} onChange={(e) => update('finalExamWeight', Number(e.target.value) / 100)} /></div>
          </div>
          <p className={`mt-2 text-xs ${totalWeight !== 100 ? 'text-red-600' : 'text-amber-600'}`}>Tổng hiện tại: {totalWeight}%</p>
        </div>
        <div className="border-b pb-4">
          <h5 className="mb-3 font-semibold text-slate-700">Cài đặt Game</h5>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Điểm mặc định / câu đúng (0.25 - 2)</Label><Input type="number" step={0.25} min={0.25} max={2} value={localSettings.defaultGamePoints} onChange={(e) => update('defaultGamePoints', Number(e.target.value))} /></div>
            <div><Label>Giới hạn KTTX từ game (1 - 10)</Label><Input type="number" min={1} max={10} value={localSettings.gamePointsCap} onChange={(e) => update('gamePointsCap', Number(e.target.value))} /></div>
          </div>
        </div>
        <div>
          <h5 className="mb-3 font-semibold text-slate-700">Nhóm tự động</h5>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <input aria-label="Tự động tạo nhóm khi bắt đầu game kéo co" type="checkbox" checked={localSettings.autoCreateGroups} onChange={(e) => update('autoCreateGroups', e.target.checked)} className="rounded border-slate-300 text-blue-900" />
              <Label>Tự động tạo nhóm khi bắt đầu game kéo co</Label>
            </div>
            <div><Label>Số nhóm mặc định (2 - 10)</Label><Input type="number" min={2} max={10} value={localSettings.groupCount} onChange={(e) => update('groupCount', Number(e.target.value))} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Hủy</Button>
          <Button onClick={() => onSave(localSettings)} disabled={totalWeight !== 100}>Lưu cài đặt</Button>
        </div>
      </div>
    </Modal>
  );
}

export function CurriculumTab({ classId, canManage }: { classId: string; canManage: boolean }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [plans, setPlans] = useState<TeachingPlan[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState<string | null>(null);
  const [createSubjectOpen, setCreateSubjectOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TeachingPlan | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const [subjectsRes, plansRes, lecturesRes] = await Promise.all([
        api<{ subjects: Subject[] }>(`/classes/${classId}/subjects`),
        api<{ plans: TeachingPlan[] }>(`/classes/${classId}/teaching-plans`),
        api<{ lectures: Lecture[] }>(`/classes/${classId}/lectures`),
      ]);
      setSubjects(subjectsRes.subjects);
      setPlans(plansRes.plans);
      setLectures(lecturesRes.lectures);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải chương trình');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void loadPlans(); }, [loadPlans]);

  async function createPlan(subjectId: string, name: string, description: string) {
    try {
      await api(`/classes/${classId}/teaching-plans`, { method: 'POST', body: JSON.stringify({ subjectId, name, description }) });
      toast.success('Đã tạo chương trình');
      setCreateOpen(null);
      await loadPlans();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function deletePlan(pid: string) {
    if (!window.confirm('Xóa chương trình này và tất cả mục con?')) return;
    try {
      await api(`/teaching-plans/${pid}`, { method: 'DELETE' });
      toast.success('Đã xóa');
      await loadPlans();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function handleImported() {
    setImportOpen(null);
    await loadPlans();
  }

  async function toggleLecture(lecture: Lecture) {
    const nextCompleted = !lecture.completedAt;
    setLectures((ls) => ls.map((l) => (l.id === lecture.id ? { ...l, completedAt: nextCompleted ? new Date().toISOString() : null } : l)));
    try {
      await api(`/lectures/${lecture.id}/progress`, { method: 'PATCH', body: JSON.stringify({ completed: nextCompleted }) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi cập nhật tiến độ');
      await loadPlans();
    }
  }

  if (loading) return <Spinner />;

  const linkedLectureIds = new Set(plans.flatMap((plan) => plan.items.map((it) => it.lectureId).filter((id): id is string => !!id)));
  const allUnlinkedLectures = lectures.filter((l) => !linkedLectureIds.has(l.id));

  function renderUnlinkedSection(unlinkedLectures: Lecture[]) {
    if (unlinkedLectures.length === 0) return null;
    return (
      <div className="space-y-3">
        <h5 className="text-sm font-semibold text-slate-600">Bài giảng khác (chưa gắn chương trình)</h5>
        <ul className="divide-y divide-slate-200 rounded-sm border border-slate-200 bg-white">
          {unlinkedLectures.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3">
              <input
                aria-label={`Đánh dấu hoàn thành bài giảng ${l.title}`}
                type="checkbox"
                checked={!!l.completedAt}
                disabled={!canManage}
                onChange={() => void toggleLecture(l)}
                className="h-4 w-4 rounded border-slate-300 text-blue-900 disabled:opacity-50"
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${l.completedAt ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {l.chapter ? `${l.chapter} — ` : ''}{l.title}
                </p>
              </div>
              {l.completedAt && <span className="shrink-0 text-xs text-slate-400">{new Date(l.completedAt).toLocaleDateString('vi-VN')}</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function renderPlanCard(plan: TeachingPlan) {
    return (
      <Card key={plan.id} className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-slate-800">{plan.name}</h4>
            <p className="mt-1 text-sm text-slate-500">{plan.description || 'Không có mô tả'}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">Tổng {plan.totalPeriods} tiết</span>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                {plan.items.filter((it) => it.status === 'completed').length}/{plan.items.length} mục hoàn thành
              </span>
            </div>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" className="!px-2 !py-1" onClick={() => setSelectedPlan(plan)}>Chi tiết</Button>
              <Button variant="ghost" className="!px-2 !py-1 text-red-600 hover:bg-red-50" onClick={() => void deletePlan(plan.id)}>Xóa</Button>
            </div>
          )}
        </div>
        {plan.items.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-200 rounded-sm border border-slate-200">
            {plan.items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={`w-6 text-center ${it.status === 'completed' ? 'text-emerald-600' : it.status === 'in_progress' ? 'text-blue-600' : 'text-slate-400'}`}>
                  {it.status === 'completed' ? '✓' : it.status === 'in_progress' ? '▶' : '○'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-slate-700">{it.week ? `Tuần ${it.week} — ` : ''}{it.chapter ? `${it.chapter} — ` : ''}{it.topic}</p>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-slate-100">
                    <div className="h-full bg-blue-900 transition-[width]" style={{ width: `${(it.completedPeriods / it.plannedPeriods) * 100}%` }} />
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{it.completedPeriods}/{it.plannedPeriods} tiết</span>
                {canManage && (
                  <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setSelectedPlan({ ...plan, items: plan.items.filter((x) => x.id === it.id) })}>
                    Sửa
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex justify-end">
          <Button variant="secondary" className="!py-1.5" onClick={() => setCreateSubjectOpen(true)}>+ Thêm môn học</Button>
        </div>
      )}
      {subjects.map((subject) => {
        const subjectPlans = plans.filter((p) => p.subjectId === subject.id);
        const subjectUnlinked = allUnlinkedLectures.filter((l) => l.subjectId === subject.id);
        return (
          <div key={subject.id} className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="font-semibold text-slate-800">{subject.name}</h4>
              {canManage && (
                <div className="flex gap-2">
                  <Button variant="secondary" className="!py-1.5" onClick={() => setImportOpen(subject.id)}><i className="fas fa-file-excel" /> Nhập Excel</Button>
                  <Button variant="secondary" className="!py-1.5" onClick={() => setCreateOpen(subject.id)}>+ Tạo chương trình</Button>
                </div>
              )}
            </div>
            {subjectPlans.length === 0 ? (
              <Card className="p-6 text-center">
                <EmptyState message="Chưa có chương trình đào tạo cho môn này. Tạo mới hoặc nhập từ Excel." />
              </Card>
            ) : (
              <div className="space-y-3">{subjectPlans.map(renderPlanCard)}</div>
            )}
            {renderUnlinkedSection(subjectUnlinked)}
          </div>
        );
      })}
      {renderUnlinkedSection(allUnlinkedLectures.filter((l) => !l.subjectId))}
      {canManage && createOpen && (
        <CreatePlanModal subjectId={createOpen} onClose={() => setCreateOpen(null)} onCreate={(name, desc) => createPlan(createOpen, name, desc)} />
      )}
      {importOpen && (
        <ImportCurriculumModal classId={classId} subjectId={importOpen} onClose={() => setImportOpen(null)} onImported={handleImported} />
      )}
      {canManage && createSubjectOpen && (
        <CreateSubjectModal classId={classId} onClose={() => setCreateSubjectOpen(false)} onCreated={loadPlans} />
      )}
      {selectedPlan && <PlanDetailModal plan={selectedPlan} canManage={canManage} onClose={() => setSelectedPlan(null)} onSaved={loadPlans} />}
    </div>
  );
}

function CreateSubjectModal({ classId, onClose, onCreated }: { classId: string; onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api(`/classes/${classId}/subjects`, { method: 'POST', body: JSON.stringify({ name }) });
      toast.success('Đã thêm môn học');
      onClose();
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Thêm môn học">
      <div className="space-y-3">
        <div><Label>Tên môn học *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Vật lý đại cương" /></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy || !name.trim()}>Thêm</Button></div>
      </div>
    </Modal>
  );
}

interface TeachingPlan {
  id: string;
  classId: string;
  subjectId: string | null;
  name: string;
  description: string;
  totalPeriods: number;
  items: CurriculumItem[];
}

interface CurriculumItem {
  id: string;
  week: number | null;
  chapter: string;
  topic: string;
  plannedPeriods: number;
  completedPeriods: number;
  status: 'pending' | 'in_progress' | 'completed';
  sortOrder: number;
  lectureId?: string | null;
}

function CreatePlanModal({ onClose, onCreate }: { subjectId: string; onClose: () => void; onCreate: (name: string, desc: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate(name, desc);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Tạo chương trình đào tạo">
      <div className="space-y-3">
        <div><Label>Tên chương trình *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Chương trình học kỳ 1 2026-2027" /></div>
        <div><Label>Mô tả</Label><Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy || !name.trim()}>Tạo</Button></div>
      </div>
    </Modal>
  );
}

function ImportCurriculumModal({ classId, subjectId, onClose, onImported }: { classId: string; subjectId: string; onClose: () => void; onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  async function downloadTemplate() {
    setDownloadingTemplate(true);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/classes/${classId}/teaching-plans/template.xlsx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Tải file mẫu thất bại');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mau-chuong-trinh-dao-tao-${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải file mẫu');
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('subjectId', subjectId);
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/classes/${classId}/teaching-plans/import-curriculum`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Import failed');
      const data = await res.json();
      toast.success(`Đã tạo ${data.created} mục chương trình (tổng ${data.totalPeriods} tiết)`);
      if (data.errors.length) toast.error(data.errors.slice(0, 5).join('; '));
      onClose();
      await onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi import');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Nhập chương trình đào tạo từ Excel" wide>
      <p className="mb-4 text-sm text-slate-500">
        File cần các cột: <strong>Tuần, Chương/Phần, Chủ đề/Nội dung, Số tiết dự kiến</strong>.
        Bắt buộc có cột <strong>Chủ đề/Nội dung</strong>; các cột còn lại có thể để trống.
        Cột "Tuần" và "Chương/Phần" dùng để tổ chức; "Số tiết" mặc định = 1.
      </p>
      <div className="mb-4">
        <Button variant="secondary" onClick={() => void downloadTemplate()} disabled={downloadingTemplate}>
          <i className="fas fa-file-excel" /> {downloadingTemplate ? 'Đang tải…' : 'Tải file mẫu Excel'}
        </Button>
      </div>
      <input
        aria-label="Chọn file chương trình đào tạo"
        type="file"
        accept=".csv,.xlsx"
        onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        className="mb-4 block w-full text-sm text-slate-600 file:mr-3 file:rounded-sm file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-700"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
        <Button onClick={() => void submit()} disabled={busy || !file}>{busy ? 'Đang nhập…' : 'Nhập chương trình'}</Button>
      </div>
    </Modal>
  );
}

function PlanDetailModal({ plan, canManage, onClose, onSaved }: { plan: TeachingPlan; canManage: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<CurriculumItem | null>(null);

  async function deleteItem(id: string) {
    if (!window.confirm('Xóa mục này?')) return;
    try {
      await api(`/curriculum-items/${id}`, { method: 'DELETE' });
      toast.success('Đã xóa');
      await onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  const pending = plan.items.filter((i) => i.status === 'pending').length;
  const inProgress = plan.items.filter((i) => i.status === 'in_progress').length;
  const completed = plan.items.filter((i) => i.status === 'completed').length;

  return (
    <Modal open onClose={onClose} title={`Chi tiết: ${plan.name}`} wide>
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <span className="px-2 py-1 rounded bg-slate-100 text-slate-600">Chờ: <strong>{pending}</strong></span>
          <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">Đang dạy: <strong>{inProgress}</strong></span>
          <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">Hoàn thành: <strong>{completed}</strong></span>
        </div>
        {canManage && (
          <div className="flex justify-end">
            <Button variant="secondary" className="!py-1.5" onClick={() => setAddOpen(true)}>+ Thêm mục</Button>
          </div>
        )}
        <ul className="max-h-[400px] space-y-1.5 overflow-y-auto pr-1 divide-y divide-slate-200 rounded-sm border border-slate-200">
          {plan.items.map((it) => (
            <li key={it.id} className={`px-3 py-2 ${it.status === 'completed' ? 'bg-emerald-50' : it.status === 'in_progress' ? 'bg-blue-50' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`w-6 text-center font-bold ${it.status === 'completed' ? 'text-emerald-600' : it.status === 'in_progress' ? 'text-blue-600' : 'text-slate-400'}`}>
                  {it.status === 'completed' ? '✓' : it.status === 'in_progress' ? '▶' : '○'}
                </span>
                <span className="text-xs text-slate-500 shrink-0">{it.week ? `T${it.week}` : ''}</span>
                <span className="text-xs text-slate-400 shrink-0">{it.chapter}</span>
                <span className="flex-1 min-w-0 truncate font-medium text-slate-700">{it.topic}</span>
                <span className="shrink-0 text-xs text-slate-500">{it.plannedPeriods} tiết</span>
                <div className="w-32 h-1.5 rounded bg-slate-100">
                  <div className="h-full bg-blue-900 rounded" style={{ width: `${(it.completedPeriods / it.plannedPeriods) * 100}%` }} />
                </div>
                <span className="shrink-0 text-xs text-slate-500">{it.completedPeriods}/{it.plannedPeriods}</span>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setEditItem(it)}>Sửa</Button>
                    <Button variant="ghost" className="!px-2 !py-1 text-xs text-red-600" onClick={() => void deleteItem(it.id)}>Xóa</Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        {addOpen && <AddItemModal planId={plan.id} onClose={() => setAddOpen(false)} onAdded={onSaved} />}
        {editItem && <EditItemModal item={editItem} onClose={() => setEditItem(null)} onSaved={onSaved} />}
      </div>
    </Modal>
  );
}

function AddItemModal({ planId, onClose, onAdded }: { planId: string; onClose: () => void; onAdded: () => Promise<void> }) {
  const [week, setWeek] = useState<number | null>(null);
  const [chapter, setChapter] = useState('');
  const [topic, setTopic] = useState('');
  const [periods, setPeriods] = useState(1);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!topic.trim()) return;
    setBusy(true);
    try {
      await api(`/teaching-plans/${planId}/items`, { method: 'POST', body: JSON.stringify({ week, chapter, topic, plannedPeriods: periods }) });
      toast.success('Đã thêm');
      onClose();
      await onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Thêm mục chương trình">
      <div className="space-y-3">
        <div><Label>Tuần</Label><Input type="number" min={1} max={52} value={week ?? ''} onChange={(e) => setWeek(e.target.value ? Number(e.target.value) : null)} placeholder="Để trống nếu không áp dụng" /></div>
        <div><Label>Chương/Phần</Label><Input value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="VD: Chương 2" /></div>
        <div><Label>Chủ đề/Nội dung *</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: Phân tích mạch điện" /></div>
        <div><Label>Số tiết dự kiến</Label><Input type="number" min={1} max={50} value={periods} onChange={(e) => setPeriods(Number(e.target.value))} /></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy || !topic.trim()}>Thêm</Button></div>
      </div>
    </Modal>
  );
}

function EditItemModal({ item, onClose, onSaved }: { item: CurriculumItem; onClose: () => void; onSaved: () => Promise<void> }) {
  const [week, setWeek] = useState<number | null>(item.week);
  const [chapter, setChapter] = useState(item.chapter);
  const [topic, setTopic] = useState(item.topic);
  const [periods, setPeriods] = useState(item.plannedPeriods);
  const [status, setStatus] = useState(item.status);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api(`/curriculum-items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ week, chapter, topic, plannedPeriods: periods }) });
      toast.success('Đã cập nhật');
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Sửa mục chương trình">
      <div className="space-y-3">
        <div><Label>Tuần</Label><Input type="number" min={1} max={52} value={week ?? ''} onChange={(e) => setWeek(e.target.value ? Number(e.target.value) : null)} placeholder="Để trống nếu không áp dụng" /></div>
        <div><Label>Chương/Phần</Label><Input value={chapter} onChange={(e) => setChapter(e.target.value)} /></div>
        <div><Label>Chủ đề/Nội dung *</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
        <div><Label>Số tiết dự kiến</Label><Input type="number" min={1} max={50} value={periods} onChange={(e) => setPeriods(Number(e.target.value))} /></div>
        <div><Label>Trạng thái</Label><Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="pending">Chờ</option>
          <option value="in_progress">Đang dạy</option>
          <option value="completed">Hoàn thành</option>
        </Select></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy}>Lưu</Button></div>
      </div>
    </Modal>
  );
}

function GroupScoresSection({ classId, canManage }: { classId: string; canManage: boolean }) {
  const classNameRef = useRef('');
  const [rows, setRows] = useState<GroupGradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarkFor, setRemarkFor] = useState<GroupGradeRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ classInfo: { id: string; name: string; subject: string }; rows: GroupGradeRow[] }>(`/classes/${classId}/group-grades`);
      classNameRef.current = res.classInfo.name;
      setRows(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  async function update(groupId: string, col: 'kttx' | 'process1' | 'finalExam', value: string) {
    const num = value === '' ? null : Math.min(10, Math.max(0, Number(value)));
    if (value !== '' && Number.isNaN(num as number)) return;
    setRows((rs) => rs.map((r) => (r.groupId === groupId ? { ...r, [col]: num } : r)));
    try {
      await api(`/classes/${classId}/group-grades/${groupId}`, { method: 'PUT', body: JSON.stringify({ [col]: num }) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu điểm');
      await load();
    }
  }

  async function exportExcel() {
    const aoa = [
      [`SỔ ĐIỂM NHÓM — ${classNameRef.current}`],
      [],
      ['STT', 'Tên nhóm', 'KTTX', 'Quá trình 1', 'KT kết thúc môn', 'Nhận xét'],
      ...rows.map((r, i) => [i + 1, r.groupName, r.kttx ?? '', r.process1 ?? '', r.finalExam ?? '', r.remark]),
    ];
    await downloadExcelWorkbook(`diem-nhom-${Date.now()}.xlsx`, 'Điểm nhóm', aoa);
    toast.success('Đã xuất Excel');
  }

  if (loading) return <Spinner />;
  if (rows.length === 0) return <Card><EmptyState message="Lớp chưa có nhóm nào. Tạo nhóm ở tab Nhóm." /></Card>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" onClick={() => void exportExcel()}><i className="fas fa-download" /> Excel</Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Tên nhóm</th>
              <th className="px-4 py-3">KTTX</th>
              <th className="px-4 py-3">Quá trình 1</th>
              <th className="px-4 py-3">KT cuối môn</th>
              <th className="px-4 py-3">Nhận xét</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((r, i) => (
              <tr key={r.groupId} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                <td className="px-4 py-2">{r.groupName}</td>
                {(['kttx', 'process1', 'finalExam'] as const).map((col) => (
                  <td key={col} className="px-4 py-2">
                    {canManage ? (
                      <input
                        aria-label={`Điểm ${col} của nhóm ${r.groupName}`}
                        type="number" min={0} max={10} step={0.25}
                        value={r[col] ?? ''}
                        placeholder="—"
                        onChange={(e) => void update(r.groupId, col, e.target.value)}
                        className="w-16 rounded-sm border border-slate-300 bg-white px-2 py-1 text-center text-sm text-slate-800 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                      />
                    ) : (
                      <span className="font-semibold">{r[col] ?? '—'}</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-2 max-w-[180px]">
                  {canManage ? (
                    <button onClick={() => setRemarkFor(r)} className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs font-medium text-slate-600 hover:bg-slate-100">
                      <i className={`fas ${r.remark ? 'fa-comment text-blue-900' : 'fa-comment-slash text-slate-400'}`} />
                      <span className="truncate">{r.remark || 'Thêm nhận xét'}</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-600">{r.remark || '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {remarkFor && (
        <RemarkModal
          row={remarkFor}
          classId={classId}
          onClose={() => setRemarkFor(null)}
          onSaved={(text) => setRows((rs) => rs.map((r) => (r.groupId === remarkFor.groupId ? { ...r, remark: text } : r)))}
        />
      )}
    </div>
  );
}

interface GroupGradeRow {
  groupId: string;
  groupName: string;
  kttx: number | null;
  process1: number | null;
  finalExam: number | null;
  remark: string;
}

interface TeachingLecture {
  id: string;
  classId: string;
  subjectId: string | null;
  chapter: string;
  title: string;
  description: string;
  sortOrder: number;
  materials: unknown[];
}

type ContentMode = 'slides' | 'video' | 'links' | 'game';

interface PendingFile {
  filename: string;
  sizeBytes: number;
  type: string;
}

function getTeachingMaterialsByType(lecture: TeachingLecture | null, type: ContentMode): TeachingMaterial[] {
  if (!lecture) return [];
  const materials = lecture.materials as TeachingMaterial[];
  switch (type) {
    case 'slides':
      return materials.filter((material) => material.type === 'pptx' || material.type === 'pdf');
    case 'video':
      return materials.filter((material) => material.type === 'video');
    case 'links':
      return materials.filter((material) => material.type === 'link');
    default:
      return [];
  }
}

export function TeachingModeTab({ classId, canManage }: { classId: string; canManage: boolean }) {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [plans, setPlans] = useState<TeachingPlan[]>([]);
  const [lectures, setLectures] = useState<TeachingLecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const linkSectionRef = useRef<HTMLDivElement>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [dropPath, setDropPath] = useState('');
  const [intakeOpen, setIntakeOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subjectsRes, plansRes, lecturesRes] = await Promise.all([
        api<{ subjects: Subject[] }>(`/classes/${classId}/subjects`),
        api<{ plans: TeachingPlan[] }>(`/classes/${classId}/teaching-plans`),
        api<{ lectures: TeachingLecture[] }>(`/classes/${classId}/lectures`),
      ]);
      setSubjects(subjectsRes.subjects);
      setPlans(plansRes.plans);
      setLectures(lecturesRes.lectures);
      if (subjectsRes.subjects.length > 0 && !selectedSubjectId) {
        setSelectedSubjectId(subjectsRes.subjects[0].id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [classId, selectedSubjectId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const scanPendingFiles = useCallback(async () => {
    if (!selectedSubjectId) { setPendingFiles([]); return; }
    try {
      const res = await api<{ dropPath: string; files: PendingFile[] }>(`/subjects/${selectedSubjectId}/pending-files`);
      setDropPath(res.dropPath);
      setPendingFiles(res.files);
    } catch {
      // silent — polling shouldn't spam toasts every 10s on a transient failure
    }
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!canManage) return;
    void scanPendingFiles();
    const interval = setInterval(() => { void scanPendingFiles(); }, 10_000);
    return () => clearInterval(interval);
  }, [canManage, scanPendingFiles]);

  const subjectPlans = plans.filter((p) => p.subjectId === selectedSubjectId);

  useEffect(() => {
    if (subjectPlans.length > 0 && !subjectPlans.some((p) => p.id === selectedPlanId)) {
      setSelectedPlanId(subjectPlans[0].id);
      setSelectedItemId(null);
    } else if (subjectPlans.length === 0) {
      setSelectedPlanId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubjectId, plans]);

  async function linkItemToLecture(itemId: string, lectureId: string | null) {
    try {
      await api(`/curriculum-items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ lectureId }) });
      toast.success(lectureId ? 'Đã liên kết bài giảng' : 'Đã hủy liên kết');
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function updateItemStatus(itemId: string, status: CurriculumItem['status']) {
    try {
      await api(`/curriculum-items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast.success('Đã cập nhật trạng thái');
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  if (loading) return <Spinner />;

  const plan = plans.find((candidate) => candidate.id === selectedPlanId);
  const selectedItem = plan?.items.find((item) => item.id === selectedItemId) ?? plan?.items[0] ?? null;
  const linkedLecture = selectedItem?.lectureId
    ? lectures.find((lecture) => lecture.id === selectedItem.lectureId) ?? null
    : null;

  return (
    <div className="flex flex-col">
      <TeachingModeSelectors
        subjects={subjects}
        subjectPlans={subjectPlans}
        selectedSubjectId={selectedSubjectId}
        selectedPlanId={selectedPlanId}
        onSubjectChange={(id) => { setSelectedSubjectId(id); setSelectedItemId(null); }}
        onPlanChange={(id) => { setSelectedPlanId(id); setSelectedItemId(null); }}
      />
      {canManage && selectedSubjectId && (
        <PendingFilesBanner
          pendingFiles={pendingFiles}
          dropPath={dropPath}
          onOpen={() => setIntakeOpen(true)}
          onScan={scanPendingFiles}
        />
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <TeachingPlanSidebar
          plans={subjectPlans}
          plan={plan}
          selectedPlanId={selectedPlanId}
          selectedItemId={selectedItemId}
          onPlanChange={(id) => { setSelectedPlanId(id); setSelectedItemId(null); }}
          onItemChange={setSelectedItemId}
        />
        <TeachingItemPanel
          classId={classId}
          subjectId={selectedSubjectId}
          item={selectedItem}
          lecture={linkedLecture}
          lectures={lectures}
          canManage={canManage}
          linkSectionRef={linkSectionRef}
          onStatusChange={updateItemStatus}
          onLectureChange={linkItemToLecture}
          onTeach={(path) => navigate(path)}
        />
      </div>

      {intakeOpen && selectedSubjectId && (
        <IntakeModal
          subjectId={selectedSubjectId}
          files={pendingFiles}
          lectures={lectures}
          onClose={() => setIntakeOpen(false)}
          onIngested={async () => {
            setIntakeOpen(false);
            await scanPendingFiles();
            await loadData();
          }}
        />
      )}
    </div>
  );
}

function TeachingModeSelectors({ subjects, subjectPlans, selectedSubjectId, selectedPlanId, onSubjectChange, onPlanChange }: {
  subjects: Subject[];
  subjectPlans: TeachingPlan[];
  selectedSubjectId: string | null;
  selectedPlanId: string | null;
  onSubjectChange: (id: string | null) => void;
  onPlanChange: (id: string | null) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h4 className="font-semibold text-slate-700">Chế độ giảng dạy</h4>
      <div className="flex items-center gap-2">
        <Select value={selectedSubjectId ?? ''} onChange={(event) => onSubjectChange(event.target.value || null)} className="w-48">
          <option value="">— Chọn môn học —</option>
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </Select>
        <Select value={selectedPlanId ?? ''} onChange={(event) => onPlanChange(event.target.value || null)} className="w-64">
          <option value="">— Chọn chương trình —</option>
          {subjectPlans.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </Select>
      </div>
    </div>
  );
}

function PendingFilesBanner({ pendingFiles, dropPath, onOpen, onScan }: {
  pendingFiles: PendingFile[];
  dropPath: string;
  onOpen: () => void;
  onScan: () => Promise<void>;
}) {
  return (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-blue-200 bg-blue-50 p-4">
      <div className="text-sm text-slate-700">
        {pendingFiles.length > 0 ? (
          <><i className="fas fa-folder-open mr-2 text-blue-600" /><strong>{pendingFiles.length} tệp mới</strong> trong thư mục — nhập vào bài giảng?</>
        ) : (
          <><i className="fas fa-folder mr-2 text-slate-400" />Dán tệp PPTX/Video vào: <code className="rounded bg-white px-1.5 py-0.5 text-xs">{dropPath}</code></>
        )}
      </div>
      <div className="flex items-center gap-2">
        {pendingFiles.length > 0 && <Button className="!py-1.5" onClick={onOpen}>Nhập ngay</Button>}
        <Button variant="secondary" className="!py-1.5" onClick={() => void onScan()}><i className="fas fa-rotate" /> Quét lại</Button>
      </div>
    </Card>
  );
}

function TeachingPlanSidebar({ plans, plan, selectedPlanId, selectedItemId, onPlanChange, onItemChange }: {
  plans: TeachingPlan[];
  plan: TeachingPlan | undefined;
  selectedPlanId: string | null;
  selectedItemId: string | null;
  onPlanChange: (id: string | null) => void;
  onItemChange: (id: string) => void;
}) {
  return (
    <aside className="lg:col-span-1">
      <Card className="p-4">
        <h5 className="mb-3 font-semibold text-slate-700">Chương trình đào tạo</h5>
        <Select value={selectedPlanId ?? ''} onChange={(event) => onPlanChange(event.target.value || null)} className="mb-4 w-full">
          <option value="">— Chọn chương trình —</option>
          {plans.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} ({candidate.totalPeriods} tiết)</option>)}
        </Select>
        {plan && (
          <ul className="max-h-96 space-y-1 overflow-y-auto">
            {plan.items.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onItemChange(item.id)} className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition ${selectedItemId === item.id ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${item.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : item.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                    {item.status === 'completed' ? '✓' : item.status === 'in_progress' ? '▶' : item.sortOrder + 1}
                  </span>
                  <span className="flex-1 truncate">{item.week ? `T${item.week} ` : ''}{item.topic}</span>
                  {item.lectureId && <i className="fas fa-link text-xs text-blue-500" title="Đã liên kết bài giảng" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </aside>
  );
}

function TeachingItemPanel({ classId, subjectId, item, lecture, lectures, canManage, linkSectionRef, onStatusChange, onLectureChange, onTeach }: {
  classId: string;
  subjectId: string | null;
  item: CurriculumItem | null;
  lecture: TeachingLecture | null;
  lectures: TeachingLecture[];
  canManage: boolean;
  linkSectionRef: React.RefObject<HTMLDivElement | null>;
  onStatusChange: (itemId: string, status: CurriculumItem['status']) => Promise<void>;
  onLectureChange: (itemId: string, lectureId: string | null) => Promise<void>;
  onTeach: (path: string) => void;
}) {
  if (!item) {
    return <main className="space-y-4 lg:col-span-2"><Card className="p-12 text-center"><i className="fas fa-chalkboard-teacher mb-3 text-5xl text-slate-300" /><h5 className="mb-1 text-lg font-medium text-slate-500">Chưa chọn mục chương trình</h5><p className="text-sm text-slate-400">Chọn một chương trình và mục ở thanh bên để xem tài liệu và bắt đầu giảng dạy</p></Card></main>;
  }

  const progress = item.plannedPeriods > 0 ? (item.completedPeriods / item.plannedPeriods) * 100 : 0;
  return (
    <main className="space-y-4 lg:col-span-2">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div><h4 className="font-semibold text-slate-800">{item.week ? `Tuần ${item.week} — ` : ''}{item.topic}</h4><p className="text-sm text-slate-500">{item.chapter} · {item.plannedPeriods} tiết · {item.completedPeriods}/{item.plannedPeriods} đã dạy</p></div>
          {canManage && <div className="flex gap-2"><Select value={item.status} onChange={(event) => void onStatusChange(item.id, event.target.value as CurriculumItem['status'])} className="w-32"><option value="pending">Chờ</option><option value="in_progress">Đang dạy</option><option value="completed">Hoàn thành</option></Select><Button variant="secondary" className="!py-1.5" onClick={() => void onStatusChange(item.id, 'in_progress')}>Bắt đầu</Button><Button className="!py-1.5" onClick={() => void onStatusChange(item.id, 'completed')}>Hoàn thành</Button></div>}
        </div>
        <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-900 transition-[width]" style={{ width: `${progress}%` }} /></div>
        {canManage && <div ref={linkSectionRef} className="mb-4 rounded border border-slate-200 bg-slate-50 p-3"><div className="mb-2 block text-sm font-medium text-slate-700">Liên kết bài giảng (để lấy tài liệu PPTX/Video/Link)</div><Select value={item.lectureId ?? ''} onChange={(event) => void onLectureChange(item.id, event.target.value || null)} className="w-full"><option value="">— Không liên kết —</option>{lectures.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.chapter ? `${candidate.chapter} — ` : ''}{candidate.title}</option>)}</Select></div>}
      </Card>
      {lecture ? (
        <Card className="p-4"><h5 className="mb-3 font-semibold text-slate-700">Tài liệu bài giảng: {lecture.title}</h5><div className="grid gap-3 sm:grid-cols-2"><MaterialSection title="📊 Trang chiếu (PPTX/PDF)" materials={getTeachingMaterialsByType(lecture, 'slides')} /><MaterialSection title="🎬 Video" materials={getTeachingMaterialsByType(lecture, 'video')} /><MaterialSection title="🔗 Liên kết & Tài liệu" materials={getTeachingMaterialsByType(lecture, 'links')} /><div className="sm:col-span-2"><Button variant="secondary" onClick={() => onTeach(`/classes/${classId}/teach/${subjectId}`)} disabled={!subjectId}><i className="fas fa-expand" /> ▶ Vào chế độ giảng dạy</Button></div></div></Card>
      ) : (
        <Card className="border-dashed border-slate-300 p-6 text-center"><i className="fas fa-link mb-2 text-3xl text-slate-400" /><p className="text-slate-500">Chưa liên kết bài giảng cho mục này</p>{canManage && <Button variant="secondary" className="mt-4" onClick={() => linkSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Liên kết bài giảng ngay</Button>}</Card>
      )}
    </main>
  );
}

function IntakeModal({
  subjectId,
  files,
  lectures,
  onClose,
  onIngested,
}: {
  subjectId: string;
  files: PendingFile[];
  lectures: TeachingLecture[];
  onClose: () => void;
  onIngested: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'new-lecture-per-file' | 'existing-lecture'>('new-lecture-per-file');
  const [lectureId, setLectureId] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (mode === 'existing-lecture' && !lectureId) {
      toast.error('Chọn bài giảng đích');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ created: unknown[]; errors: { filename: string; error: string }[] }>(
        `/subjects/${subjectId}/pending-files/ingest`,
        {
          method: 'POST',
          body: JSON.stringify({
            filenames: files.map((f) => f.filename),
            mode,
            ...(mode === 'existing-lecture' ? { lectureId } : {}),
          }),
        }
      );
      if (res.errors.length > 0) {
        toast.error(`${res.created.length} tệp đã nhập, ${res.errors.length} lỗi`);
      } else {
        toast.success(`Đã nhập ${res.created.length} tệp`);
      }
      await onIngested();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi nhập tệp');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Nhập ${files.length} tệp từ thư mục`}>
      <div className="space-y-3">
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded border border-slate-200 p-2 text-sm text-slate-600">
          {files.map((f) => (
            <li key={f.filename} className="flex items-center justify-between gap-2">
              <span className="truncate">{f.filename}</span>
              <span className="shrink-0 text-xs text-slate-400">{(f.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
            </li>
          ))}
        </ul>
        <div>
          <Label>Cách nhập</Label>
          <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="w-full">
            <option value="new-lecture-per-file">Mỗi tệp tạo một bài giảng mới</option>
            <option value="existing-lecture">Gắn tất cả vào một bài giảng có sẵn</option>
          </Select>
        </div>
        {mode === 'existing-lecture' && (
          <div>
            <Label>Bài giảng đích *</Label>
            <Select value={lectureId} onChange={(e) => setLectureId(e.target.value)} className="w-full">
              <option value="">— Chọn bài giảng —</option>
              {lectures.map((l) => (
                <option key={l.id} value={l.id}>{l.chapter ? `${l.chapter} — ` : ''}{l.title}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex justify-end pt-2">
          <Button onClick={() => void submit()} disabled={busy || files.length === 0}>Nhập</Button>
        </div>
      </div>
    </Modal>
  );
}

interface TeachingMaterial {
  id: string;
  type: string;
  title: string;
  linkUrl: string | null;
  sizeBytes: number;
  convertedFromId: string | null;
}

function MaterialSection({ title, materials }: { title: string; materials: TeachingMaterial[] }) {
  const token = useAuthStore((s) => s.token);
  return (
    <div className="space-y-2">
      <h6 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h6>
      {materials.length === 0 ? (
        <p className="text-sm text-slate-400 p-3 bg-slate-50 rounded text-center">Chưa có tài liệu</p>
      ) : (
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {materials.map((m) => (
            <li key={m.id} className="px-3 py-2 bg-white rounded border border-slate-200 hover:border-blue-300 transition">
              <a
                href={m.type === 'link' ? (m.linkUrl ?? '#') : `/api/media/${m.id}/stream?token=${encodeURIComponent(token ?? '')}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm text-slate-700 hover:text-blue-700"
              >
                <i className={`fas ${m.type === 'pptx' ? 'fa-file-powerpoint text-red-500' : m.type === 'pdf' ? 'fa-file-pdf text-red-500' : m.type === 'video' ? 'fa-file-video text-green-500' : 'fa-link text-blue-500'}`} />
                <span className="truncate">{m.title}</span>
                {m.sizeBytes > 0 && <span className="text-xs text-slate-400 ml-auto">{(m.sizeBytes / 1024 / 1024).toFixed(1)}MB</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
