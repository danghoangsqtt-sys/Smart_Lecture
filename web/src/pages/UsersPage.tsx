import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { PublicUser } from '../types';
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, Spinner } from '../components/ui';
import toast from '../stores/toastStore';
import * as XLSX from 'xlsx';

interface UserRow extends PublicUser {
  failedAttempts?: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>Import học viên</Button>
            <Button onClick={() => setCreateOpen(true)}>Tạo tài khoản</Button>
          </>
        }
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
              <thead className="bg-slate-800/60 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Tên hiển thị</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Vai trò</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-2.5">{u.displayName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{u.username}</td>
                    <td className="px-4 py-2.5">{u.role === 'admin' ? 'Quản trị' : u.role === 'teacher' ? 'GV' : 'HV'}</td>
                    <td className="px-4 py-2.5">
                      <span className={u.status === 'active' ? 'text-emerald-400' : 'text-red-400'}>
                        {u.status === 'active' ? 'Hoạt động' : 'Bị khóa'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => toggleLock(u, load)}
                          className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
                        >
                          {u.status === 'active' ? 'Khóa' : 'Mở khóa'}
                        </button>
                      )}
                      <button
                        onClick={() => resetPassword(u)}
                        className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-700"
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
      <ImportStudentsModal open={importOpen} onClose={() => setImportOpen(false)} onImported={load} />
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

function ImportStudentsModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => Promise<void> }) {
  const [rowsText, setRowsText] = useState('');
  const [busy, setBusy] = useState(false);

  function parseXlsx(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
      const lines = (rows as string[][])
        .filter((r) => r[0] && r[1])
        .map((r) => `${String(r[1]).trim()},${String(r[0]).trim()}`)
        .join('\n');
      setRowsText(lines);
      toast.info(`Đọc được ${lines.split('\n').length} dòng từ tệp`);
    };
    reader.readAsArrayBuffer(file);
  }

  async function submit() {
    const rows = rowsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [displayName, username] = l.split(',');
        return { displayName: (displayName ?? '').trim(), username: (username ?? '').trim() };
      })
      .filter((r) => r.username && r.displayName);
    if (rows.length === 0) {
      toast.error('Không có dòng hợp lệ nào');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ createdCount: number; errors: unknown[]; tempPassword: string }>('/users/import', {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      toast.success(`Đã tạo ${res.createdCount}/${rows.length} học viên. Mật khẩu mặc định: ${res.tempPassword}`);
      setRowsText('');
      onClose();
      await onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi import');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import học viên" wide>
      <div className="space-y-3">
        <p className="text-sm text-slate-400">
          Chọn tệp Excel (cột A = Họ tên, cột B = Username) hoặc dán trực tiếp, mỗi dòng:
          <code className="mx-1 rounded bg-slate-800 px-1">Họ tên,username</code>
        </p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && parseXlsx(e.target.files[0])} className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200" />
        <textarea
          value={rowsText}
          onChange={(e) => setRowsText(e.target.value)}
          rows={8}
          placeholder={'Nguyễn Văn A,hoa\nTrần Thị B,thib'}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
        <div className="flex justify-end">
          <Button onClick={submit} disabled={busy}>Import</Button>
        </div>
      </div>
    </Modal>
  );
}
