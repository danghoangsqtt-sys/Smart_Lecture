import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { PublicUser } from '../types';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, Spinner } from '../components/ui';
import { StudentProfileModal } from '../components/StudentProfileFields';
import toast from '../stores/toastStore';

interface UserRow extends PublicUser {
  failedAttempts?: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UserRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (roleFilter) params.set('role', roleFilter);
      const res = await api<{ users: UserRow[] }>(`/users?${params}`);
      setUsers(res.users);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải danh sách');
    } finally {
      setLoading(false);
    }
  }, [q, roleFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Người dùng"
        subtitle="Quản lý tài khoản giáo viên và học viên"
        actions={<Button onClick={() => setCreateOpen(true)}>Tạo tài khoản</Button>}
      />
      <Card className="mb-4 flex flex-wrap gap-3 p-4">
        <Input placeholder="Tìm theo tên / username…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="max-w-40">
          <option value="">Mọi vai trò</option>
          <option value="admin">Quản trị</option>
          <option value="teacher">Giáo viên</option>
          <option value="student">Học viên</option>
        </Select>
      </Card>
      <Card className="overflow-hidden">
        {loading ? (
          <Spinner />
        ) : users.length === 0 ? (
          <EmptyState message="Chưa có người dùng nào" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tên hiển thị</th>
                  <th className="px-4 py-3">Mã HV</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Vai trò</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">{u.displayName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{u.studentCode || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{u.username}</td>
                    <td className="px-4 py-2.5">{u.role === 'admin' ? 'Quản trị' : u.role === 'teacher' ? 'GV' : 'HV'}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={u.status === 'active' ? 'green' : 'red'}>
                        {u.status === 'active' ? 'Hoạt động' : 'Bị khóa'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {u.role === 'student' && (
                        <button
                          onClick={() => setEditingProfile(u)}
                          className="rounded-sm px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-blue-900"
                        >
                          Hồ sơ
                        </button>
                      )}
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => toggleLock(u, load)}
                          className={`rounded-sm px-2 py-1 text-xs font-semibold ${u.status === 'active' ? 'text-slate-500 hover:bg-red-50 hover:text-red-600' : 'text-emerald-700 hover:bg-emerald-50'}`}
                        >
                          {u.status === 'active' ? 'Khóa' : 'Mở khóa'}
                        </button>
                      )}
                      <button
                        onClick={() => resetPassword(u)}
                        className="rounded-sm px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-blue-900"
                      >
                        Đặt lại MK
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      {editingProfile && (
        <StudentProfileModal
          student={editingProfile}
          onClose={() => setEditingProfile(null)}
          onSaved={() => { setEditingProfile(null); void load(); }}
        />
      )}
    </div>
  );
}

async function toggleLock(u: UserRow, reload: () => Promise<void>) {
  try {
    await api(`/users/${u.id}/status`, { method: 'PATCH', body: JSON.stringify({}) });
    await reload();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Lỗi');
  }
}

async function resetPassword(u: UserRow) {
  const newPw = window.prompt(`Mật khẩu mới cho "${u.displayName}" (tối thiểu 6 ký tự):`);
  if (!newPw || newPw.length < 6) return;
  try {
    await api(`/users/${u.id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword: newPw }) });
    toast.success('Đã đặt lại mật khẩu');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Lỗi');
  }
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api('/users', { method: 'POST', body: JSON.stringify({ username, displayName, password, role }) });
      toast.success(`Đã tạo tài khoản ${username}`);
      setUsername(''); setDisplayName(''); setPassword('');
      onClose();
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tạo tài khoản');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tài khoản mới">
      <div className="space-y-3">
        <div><Label>Vai trò</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value as 'student' | 'teacher')}>
            <option value="student">Học viên</option>
            <option value="teacher">Giáo viên</option>
          </Select>
        </div>
        <div><Label>Tên hiển thị</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
        <div><Label>Username (chữ/số/dấu chấm)</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} /></div>
        <div><Label>Mật khẩu</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <div className="flex justify-end pt-2">
          <Button onClick={submit} disabled={busy || username.length < 3 || password.length < 6 || !displayName}>Tạo</Button>
        </div>
      </div>
    </Modal>
  );
}
