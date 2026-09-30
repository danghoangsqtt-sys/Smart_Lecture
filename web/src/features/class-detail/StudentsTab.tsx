import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui';
import { StudentProfileModal } from '../../components/StudentProfileFields';
import { StudentImportModal } from '../../components/StudentImportModal';
import { api } from '../../lib/api';
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
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {canManage && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-600">Học viên cũ chưa có lớp ({eligible.length})</h4>
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
        <StudentImportModal
          fixedClassId={classId}
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
