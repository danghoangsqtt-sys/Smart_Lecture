import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Label, Modal, Select, Spinner } from './ui';
import toast from '../stores/toastStore';

type Student = { id: string; displayName: string; homeClassId?: string | null };
type ClassOption = { id: string; name: string };
type Preview = { action: 'delete' | 'archive'; referenceCount: number };

export function StudentLifecycleModal({ student, mode, onClose, onChanged }: {
  student: Student;
  mode: 'transfer' | 'remove';
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === 'transfer') {
      void api<{ classes: ClassOption[] }>('/classes/mine').then((result) => setClasses(result.classes))
        .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Không tải được danh sách lớp'));
    } else {
      void api<Preview>(`/users/${student.id}/removal-preview`).then(setPreview)
        .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Không thể xem trước tài khoản'));
    }
  }, [mode, student.id]);

  async function submit() {
    setBusy(true);
    try {
      if (mode === 'transfer') {
        await api(`/users/${student.id}/transfer`, { method: 'POST', body: JSON.stringify({ classId }) });
        toast.success('Đã chuyển lớp; phiên đăng nhập cũ cần đăng nhập lại');
      } else if (preview) {
        await api(`/users/${student.id}`, { method: 'DELETE', body: JSON.stringify({ expectedAction: preview.action }) });
        toast.success(preview.action === 'delete' ? 'Đã xóa tài khoản chưa có dữ liệu học tập' : 'Đã lưu trữ và khóa tài khoản; dữ liệu học tập được giữ lại');
      }
      onClose();
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể xử lý học viên; vui lòng xem lại trạng thái');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${mode === 'transfer' ? 'Chuyển lớp' : 'Xử lý tài khoản'} — ${student.displayName}`}>
      <div className="space-y-4">
        {mode === 'transfer' ? (
          <>
            <p className="text-sm text-slate-600">Chỉ đổi lớp biên chế hiện tại. Điểm danh, điểm số và kết quả cũ vẫn gắn với lớp cũ; học viên phải đăng nhập lại.</p>
            <div><Label>Lớp đích</Label><Select value={classId} onChange={(event) => setClassId(event.target.value)}>
              <option value="">Chọn lớp đích</option>
              {classes.filter((cls) => cls.id !== student.homeClassId).map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
            </Select></div>
          </>
        ) : preview ? (
          <p className="text-sm text-slate-700">
            {preview.action === 'delete'
              ? 'Tài khoản chưa có dữ liệu học tập tham chiếu. Xác nhận sẽ xóa vĩnh viễn tài khoản, ghi danh và lịch sử lớp.'
              : `Tài khoản có ${preview.referenceCount} tham chiếu dữ liệu. Xác nhận sẽ lưu trữ, khóa đăng nhập và giữ nguyên toàn bộ lịch sử; không xóa vĩnh viễn.`}
          </p>
        ) : <Spinner />}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
          <Button onClick={() => void submit()} disabled={busy || (mode === 'transfer' ? !classId : !preview)}>
            {mode === 'transfer' ? 'Chuyển lớp' : preview?.action === 'archive' ? 'Lưu trữ tài khoản' : 'Xóa tài khoản'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
