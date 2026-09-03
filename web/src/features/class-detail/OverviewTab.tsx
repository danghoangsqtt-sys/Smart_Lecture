import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import toast from '../../stores/toastStore';
import type { DashboardData } from './types';

export function OverviewTab({ classId }: { classId: string }) {
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
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-blue-900" style={{ width: `${dashboard.progress.percent}%` }} /></div>
            <div className="flex justify-between border-t pt-2"><span>Hoàn thành</span><span className="font-bold text-blue-900">{dashboard.progress.percent}%</span></div>
            {dashboard.progress.totalPeriods > 0 && <div className="flex justify-between text-slate-500"><span>Ước tính số tiết</span><span className="font-semibold">{dashboard.progress.estimatedPeriodsDone}/{dashboard.progress.totalPeriods}</span></div>}
          </div>
        </Card>
        <Card className="p-4">
          <h4 className="mb-3 font-semibold text-slate-700">Hoạt động gần đây</h4>
          {dashboard.recentActivity.length === 0 ? <p className="text-sm text-slate-500">Chưa có hoạt động</p> : (
            <ul className="space-y-2 text-sm">
              {dashboard.recentActivity.slice(0, 5).map((activity) => <li key={`${activity.type}:${activity.date}:${activity.title}`} className="flex justify-between text-slate-600"><span className="truncate pr-2">{activity.type === 'lecture' ? '📖' : activity.type === 'exam' ? '📝' : activity.type === 'game' ? '🎮' : '📅'} {activity.title}</span><span className="text-xs text-slate-400">{new Date(activity.date).toLocaleDateString('vi-VN')}</span></li>)}
            </ul>
          )}
        </Card>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Link to="/games" state={{ classId }}><Button><i className="fas fa-gamepad" /> Tạo hoạt động cho lớp</Button></Link>
        <Button variant="secondary" onClick={() => void exportExcel()}>Xuất danh sách Excel</Button>
      </div>
    </div>
  );
}
