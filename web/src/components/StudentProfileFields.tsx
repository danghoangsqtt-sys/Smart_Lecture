import { useState } from 'react';
import { api } from '../lib/api';
import { Button, Input, Label, Modal, Select } from './ui';
import toast from '../stores/toastStore';

export interface StudentProfileTarget {
  id: string;
  displayName: string;
  studentCode?: string | null;
  dob?: string | null;
  gender?: string | null;
  hometown?: string | null;
}

export function StudentProfileModal({ student, onClose, onSaved }: { student: StudentProfileTarget; onClose: () => void; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState(student.displayName);
  const [studentCode, setStudentCode] = useState(student.studentCode ?? '');
  const [dob, setDob] = useState(student.dob ?? '');
  const [gender, setGender] = useState(student.gender ?? '');
  const [hometown, setHometown] = useState(student.hometown ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api(`/users/${student.id}/profile`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName, studentCode, dob, gender, hometown }),
      });
      toast.success('Đã lưu hồ sơ học viên');
      onClose();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu hồ sơ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Hồ sơ học viên — ${student.displayName}`}>
      <div className="space-y-3">
        <div><Label>Họ và tên *</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Mã học viên</Label><Input value={studentCode} onChange={(e) => setStudentCode(e.target.value)} /></div>
          <div><Label>Ngày sinh</Label><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></div>
          <div>
            <Label>Giới tính</Label>
            <Select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="">— Chưa chọn —</option>
              <option value="Nam">Nam</option>
              <option value="Nữ">Nữ</option>
              <option value="Khác">Khác</option>
            </Select>
          </div>
          <div><Label>Quê quán</Label><Input value={hometown} onChange={(e) => setHometown(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
          <Button onClick={() => void save()} disabled={busy || !displayName.trim()}>Lưu</Button>
        </div>
      </div>
    </Modal>
  );
}
