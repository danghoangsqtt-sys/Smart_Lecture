import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import toast from '../stores/toastStore';
import { OverviewTab } from '../features/class-detail/OverviewTab';
import { StudentsTab } from '../features/class-detail/StudentsTab';
import type { ClassMeta, StudentProfile } from '../features/class-detail/types';
import { AttendanceTab } from '../features/class-detail/AttendanceTab';
import { GradebookTab } from '../features/class-detail/GradebookTab';
import { GroupsTab } from '../features/class-detail/GroupsTab';
import { SettingsTab } from '../features/class-detail/SettingsTab';
export { CurriculumTab } from '../features/class-detail/CurriculumTab';
export { TeachingModeTab } from '../features/class-detail/TeachingWorkspaceTab';



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
