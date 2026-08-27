import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { disconnectSocket } from '../realtime/socket';
import { api } from '../lib/api';
import { Modal, Label, Input, Button } from './ui';
import toast from '../stores/toastStore';
import { ContextGuide } from './ContextGuide';

interface NavItemDef {
  to: string;
  label: string;
  icon: string;
  roles: ('admin' | 'teacher' | 'student')[];
}

const NAV: NavItemDef[] = [
  { to: '/', label: 'Tổng quan', icon: 'fa-gauge-high', roles: ['admin', 'teacher', 'student'] },
  { to: '/users', label: 'Người dùng', icon: 'fa-users-gear', roles: ['admin'] },
  { to: '/classes', label: 'Lớp học', icon: 'fa-chalkboard-user', roles: ['admin', 'teacher', 'student'] },
  { to: '/lectures', label: 'Bài giảng', icon: 'fa-book-open', roles: ['teacher'] },
  { to: '/teaching', label: 'Giảng dạy', icon: 'fa-person-chalkboard', roles: ['teacher', 'admin'] },
  { to: '/curriculum', label: 'Chương trình đào tạo', icon: 'fa-folder-tree', roles: ['teacher', 'admin'] },
  { to: '/learning', label: 'Học liệu của tôi', icon: 'fa-graduation-cap', roles: ['student'] },
  { to: '/questions', label: 'Ngân hàng câu hỏi', icon: 'fa-database', roles: ['teacher', 'admin'] },
  { to: '/exams', label: 'Đề thi & kết quả', icon: 'fa-clipboard-check', roles: ['teacher', 'admin'] },
  { to: '/my-exams', label: 'Bài thi của tôi', icon: 'fa-pen-to-square', roles: ['student'] },
  { to: '/my-results', label: 'Kết quả của tôi', icon: 'fa-chart-simple', roles: ['student'] },
  { to: '/games', label: 'Trò chơi', icon: 'fa-gamepad', roles: ['teacher', 'admin'] },
  { to: '/schedule', label: 'Lịch giảng dạy', icon: 'fa-calendar-days', roles: ['teacher', 'admin'] },
  { to: '/settings', label: 'Cài đặt', icon: 'fa-gear', roles: ['admin', 'teacher', 'student'] },
];

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const [pwOpen, setPwOpen] = useState(user?.mustChangePassword ?? false);
  const [guideOpen, setGuideOpen] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  const visibleNav = NAV.filter((item) => item.roles.includes(user.role));

  function handleLogout() {
    disconnectSocket();
    clearAuth();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-100 bg-white md:flex">
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-blue-900 font-black text-white shadow-lg">SL</div>
          <div>
            <div className="text-base font-extrabold tracking-tight text-blue-900">SmartLecture</div>
            <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">Hệ thống dạy học nội bộ</div>
          </div>
        </div>
        <nav className="custom-scrollbar flex-1 space-y-0.5 overflow-y-auto py-5">
          {visibleNav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `group mx-3 mb-1 flex items-center gap-3.5 rounded-sm px-4 py-3 text-sm transition-all duration-200 ${
                  isActive ? 'border-l-4 border-l-yellow-500 bg-blue-50 font-bold text-blue-900' : 'font-medium text-slate-500 hover:bg-slate-100 hover:text-blue-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <i className={`fas ${n.icon} w-5 text-center text-base ${isActive ? 'text-blue-900' : 'text-slate-400 group-hover:text-blue-700'}`} />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 overflow-x-auto border-b border-slate-100 bg-white px-4 py-3 md:px-6">
          <div className="flex gap-1 md:hidden">
            {visibleNav.slice(0, 6).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `whitespace-nowrap rounded-sm px-2.5 py-1 text-xs font-semibold ${isActive ? 'bg-blue-50 text-blue-900' : 'text-slate-500'}`}>
                {n.label}
              </NavLink>
            ))}
          </div>
          <span className="hidden text-xs font-bold uppercase tracking-wide text-slate-400 md:inline">{user.role === 'admin' ? 'Quản trị viên' : user.role === 'teacher' ? 'Giáo viên' : 'Học viên'}</span>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setGuideOpen(true)} className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-800 transition hover:bg-blue-100" aria-label="Mở hướng dẫn cho trang này" title="Hướng dẫn trang này">
              <i className="fas fa-circle-question" /> <span className="hidden sm:inline">Hướng dẫn</span>
            </button>
            <span className="text-sm font-semibold text-slate-600">{user.displayName}</span>
            {user.mustChangePassword && (
              <button onClick={() => setPwOpen(true)} className="rounded-sm border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-orange-700 hover:bg-orange-100">
                Đổi mật khẩu
              </button>
            )}
            <button onClick={handleLogout} className="rounded-sm border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-700">Đăng xuất</button>
          </div>
        </header>
        <main className="custom-scrollbar flex-1 overflow-y-auto p-4 md:p-6">{<Outlet />}</main>
      </div>

      <ChangePasswordModal open={pwOpen} required={user.mustChangePassword} onClose={() => setPwOpen(false)} />
      <ContextGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}

function ChangePasswordModal({ open, required, onClose }: { open: boolean; required: boolean; onClose: () => void }) {
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
      useAuthStore.setState((s) => (s.user ? { user: { ...s.user, mustChangePassword: false } } : s));
      toast.success('Đã đổi mật khẩu');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={required ? () => undefined : onClose} title="Đổi mật khẩu">
      <div className="space-y-3">
        <div><Label>Mật khẩu hiện tại</Label><Input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} /></div>
        <div><Label>Mật khẩu mới (tối thiểu 6 ký tự)</Label><Input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-2">
          {!required && <Button variant="ghost" onClick={onClose}>Hủy</Button>}
          <Button variant="primary" onClick={submit} disabled={busy || newPassword.length < 6}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
