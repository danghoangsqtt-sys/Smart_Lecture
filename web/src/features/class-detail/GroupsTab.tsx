import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, Input, Label, Modal, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import toast from '../../stores/toastStore';
import { useAuthStore } from '../../stores/authStore';
import { GroupScoresSection } from './CurriculumTab';
import type { Group, StudentProfile } from './types';

export function GroupsTab({ classId, students, canManage }: { classId: string; students: StudentProfile[]; canManage: boolean }) {
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
