import { useCallback, useEffect, useState } from 'react';
import { Button, Modal } from '../../components/ui';
import { StudentProfileModal } from '../../components/StudentProfileFields';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import toast from '../../stores/toastStore';
import type { StudentLite, StudentProfile } from './types';

export function StudentsTab({ classId, students, canManage, onChanged }: { classId: string; students: StudentProfile[]; canManage: boolean; onChanged: () => Promise<void> }) {
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
