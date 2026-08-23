import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { disconnectSocket } from '../realtime/socket';
import { api } from '../lib/api';
import { Modal, Label, Input } from './ui';
import toast from '../stores/toastStore';

interface NavItemDef {
  to: string;
  label: string;
  roles: ('admin' | 'teacher' | 'student')[];
}

const NAV: NavItemDef[] = [
  { to: '/', label: 'Tá»•ng quan', roles: ['admin', 'teacher', 'student'] },
  { to: '/users', label: 'NgÆ°á»i dÃ¹ng', roles: ['admin', 'teacher'] },
  { to: '/classes', label: 'Lá»›p há»c', roles: ['admin', 'teacher', 'student'] },
  { to: '/lectures', label: 'BÃ i giáº£ng', roles: ['teacher'] },
  { to: '/learning', label: 'Há»c liá»‡u cá»§a tÃ´i', roles: ['student'] },
  { to: '/questions', label: 'NgÃ¢n hÃ ng cÃ¢u há»i', roles: ['teacher', 'admin'] },
  { to: '/exams', label: 'Äá» thi & káº¿t quáº£', roles: ['teacher', 'admin'] },
  { to: '/my-exams', label: 'BÃ i thi cá»§a tÃ´i', roles: ['student'] },
  { to: '/games', label: 'TrÃ² chÆ¡i', roles: ['teacher'] },
  { to: '/gradebook', label: 'Sá»• Ä‘iá»ƒm', roles: ['teacher', 'admin'] },
  { to: '/attendance', label: 'Äiá»ƒm danh', roles: ['teacher', 'admin'] },
  { to: '/settings', label: 'CÃ i Ä‘áº·t', roles: ['admin', 'teacher', 'student'] },
];

export default function Layout() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const [pwOpen, setPwOpen] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  function handleLogout() {
    disconnectSocket();
    clearAuth();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900 md:flex">
        <div className="mb-4 flex items-center gap-2 px-3 pt-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 font-bold">SL</div>
          <span className="font-semibold">SmartLecture</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
          {NAV.filter((n) => n.roles.includes(user.role)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? 'bg-indigo-600/20 font-medium text-indigo-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 overflow-x-auto border-b border-slate-800 bg-slate-900 px-4 py-3 md:px-6">
          <div className="flex gap-1 md:hidden">
            {NAV.filter((n) => n.roles.includes(user.role)).slice(0, 6).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `whitespace-nowrap rounded-md px-2.5 py-1 text-xs ${isActive ? 'bg-indigo-600/30 text-indigo-300' : 'text-slate-400'}`}>
                {n.label}
              </NavLink>
            ))}
          </div>
          <span className="hidden text-sm text-slate-500 md:inline">{user.role === 'admin' ? 'Quáº£n trá»‹ viÃªn' : user.role === 'teacher' ? 'GiÃ¡o viÃªn' : 'Há»c viÃªn'}</span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-slate-300">{user.displayName}</span>
            {user.mustChangePassword && (
              <button onClick={() => setPwOpen(true)} className="rounded-lg bg-amber-700/80 px-2.5 py-1.5 text-xs text-white hover:bg-amber-600">
                Äá»•i máº­t kháº©u
              </button>
            )}
            <button onClick={handleLogout} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700">ÄÄƒng xuáº¥t</button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{<Outlet />}</main>
      </div>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [oldPassword, setOld] = useState('');
  const [newPassword, setNew] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
      useAuthStore.setState((s) => (s.user ? { user: { ...s.user, mustChangePassword: false } } : s));
      toast.success('ÄÃ£ Ä‘á»•i máº­t kháº©u');
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Äá»•i máº­t kháº©u">
      <div className="space-y-3">
        <div><Label>Máº­t kháº©u hiá»‡n táº¡i</Label><Input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} /></div>
        <div><Label>Máº­t kháº©u má»›i (tá»‘i thiá»ƒu 6 kÃ½ tá»±)</Label><Input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-slate-200">Há»§y</button>
          <button onClick={submit} disabled={busy || newPassword.length < 6} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? 'Äang lÆ°uâ€¦' : 'LÆ°u'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
