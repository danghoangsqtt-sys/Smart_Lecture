import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, EmptyState, Input, Label, Modal, Select, Spinner, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import toast from '../../stores/toastStore';
import { useAuthStore } from '../../stores/authStore';
import { downloadExcelWorkbook, RemarkModal } from './GradebookTab';
import type { Lecture, Subject } from './types';

export function CurriculumTab({ classId, canManage }: { classId: string; canManage: boolean }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [plans, setPlans] = useState<TeachingPlan[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState<string | null>(null);
  const [createSubjectOpen, setCreateSubjectOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TeachingPlan | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const [subjectsRes, plansRes, lecturesRes] = await Promise.all([
        api<{ subjects: Subject[] }>(`/classes/${classId}/subjects`),
        api<{ plans: TeachingPlan[] }>(`/classes/${classId}/teaching-plans`),
        api<{ lectures: Lecture[] }>(`/classes/${classId}/lectures`),
      ]);
      setSubjects(subjectsRes.subjects);
      setPlans(plansRes.plans);
      setLectures(lecturesRes.lectures);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải chương trình');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void loadPlans(); }, [loadPlans]);

  async function createPlan(subjectId: string, name: string, description: string) {
    try {
      await api(`/classes/${classId}/teaching-plans`, { method: 'POST', body: JSON.stringify({ subjectId, name, description }) });
      toast.success('Đã tạo chương trình');
      setCreateOpen(null);
      await loadPlans();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function deletePlan(pid: string) {
    if (!window.confirm('Xóa chương trình này và tất cả mục con?')) return;
    try {
      await api(`/teaching-plans/${pid}`, { method: 'DELETE' });
      toast.success('Đã xóa');
      await loadPlans();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  async function handleImported() {
    setImportOpen(null);
    await loadPlans();
  }

  async function toggleLecture(lecture: Lecture) {
    const nextCompleted = !lecture.completedAt;
    setLectures((ls) => ls.map((l) => (l.id === lecture.id ? { ...l, completedAt: nextCompleted ? new Date().toISOString() : null } : l)));
    try {
      await api(`/lectures/${lecture.id}/progress`, { method: 'PATCH', body: JSON.stringify({ completed: nextCompleted }) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi cập nhật tiến độ');
      await loadPlans();
    }
  }

  if (loading) return <Spinner />;

  const linkedLectureIds = new Set(plans.flatMap((plan) => plan.items.map((it) => it.lectureId).filter((id): id is string => !!id)));
  const allUnlinkedLectures = lectures.filter((l) => !linkedLectureIds.has(l.id));

  function renderUnlinkedSection(unlinkedLectures: Lecture[]) {
    if (unlinkedLectures.length === 0) return null;
    return (
      <div className="space-y-3">
        <h5 className="text-sm font-semibold text-slate-600">Bài giảng khác (chưa gắn chương trình)</h5>
        <ul className="divide-y divide-slate-200 rounded-sm border border-slate-200 bg-white">
          {unlinkedLectures.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3">
              <input
                aria-label={`Đánh dấu hoàn thành bài giảng ${l.title}`}
                type="checkbox"
                checked={!!l.completedAt}
                disabled={!canManage}
                onChange={() => void toggleLecture(l)}
                className="h-4 w-4 rounded border-slate-300 text-blue-900 disabled:opacity-50"
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${l.completedAt ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {l.chapter ? `${l.chapter} — ` : ''}{l.title}
                </p>
              </div>
              {l.completedAt && <span className="shrink-0 text-xs text-slate-400">{new Date(l.completedAt).toLocaleDateString('vi-VN')}</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function renderPlanCard(plan: TeachingPlan) {
    return (
      <Card key={plan.id} className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-slate-800">{plan.name}</h4>
            <p className="mt-1 text-sm text-slate-500">{plan.description || 'Không có mô tả'}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">Tổng {plan.totalPeriods} tiết</span>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                {plan.items.filter((it) => it.status === 'completed').length}/{plan.items.length} mục hoàn thành
              </span>
            </div>
          </div>
          {canManage && (
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" className="!px-2 !py-1" onClick={() => setSelectedPlan(plan)}>Chi tiết</Button>
              <Button variant="ghost" className="!px-2 !py-1 text-red-600 hover:bg-red-50" onClick={() => void deletePlan(plan.id)}>Xóa</Button>
            </div>
          )}
        </div>
        {plan.items.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-200 rounded-sm border border-slate-200">
            {plan.items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={`w-6 text-center ${it.status === 'completed' ? 'text-emerald-600' : it.status === 'in_progress' ? 'text-blue-600' : 'text-slate-400'}`}>
                  {it.status === 'completed' ? '✓' : it.status === 'in_progress' ? '▶' : '○'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-slate-700">{it.week ? `Tuần ${it.week} — ` : ''}{it.chapter ? `${it.chapter} — ` : ''}{it.topic}</p>
                  <div className="h-1.5 w-full overflow-hidden rounded bg-slate-100">
                    <div className="h-full bg-blue-900 transition-[width]" style={{ width: `${(it.completedPeriods / it.plannedPeriods) * 100}%` }} />
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{it.completedPeriods}/{it.plannedPeriods} tiết</span>
                {canManage && (
                  <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setSelectedPlan({ ...plan, items: plan.items.filter((x) => x.id === it.id) })}>
                    Sửa
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <div className="flex justify-end">
          <Button variant="secondary" className="!py-1.5" onClick={() => setCreateSubjectOpen(true)}>+ Thêm môn học</Button>
        </div>
      )}
      {subjects.map((subject) => {
        const subjectPlans = plans.filter((p) => p.subjectId === subject.id);
        const subjectUnlinked = allUnlinkedLectures.filter((l) => l.subjectId === subject.id);
        return (
          <div key={subject.id} className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="font-semibold text-slate-800">{subject.name}</h4>
              {canManage && (
                <div className="flex gap-2">
                  <Button variant="secondary" className="!py-1.5" onClick={() => setImportOpen(subject.id)}><i className="fas fa-file-excel" /> Nhập Excel</Button>
                  <Button variant="secondary" className="!py-1.5" onClick={() => setCreateOpen(subject.id)}>+ Tạo chương trình</Button>
                </div>
              )}
            </div>
            {subjectPlans.length === 0 ? (
              <Card className="p-6 text-center">
                <EmptyState message="Chưa có chương trình đào tạo cho môn này. Tạo mới hoặc nhập từ Excel." />
              </Card>
            ) : (
              <div className="space-y-3">{subjectPlans.map(renderPlanCard)}</div>
            )}
            {renderUnlinkedSection(subjectUnlinked)}
          </div>
        );
      })}
      {renderUnlinkedSection(allUnlinkedLectures.filter((l) => !l.subjectId))}
      {canManage && createOpen && (
        <CreatePlanModal subjectId={createOpen} onClose={() => setCreateOpen(null)} onCreate={(name, desc) => createPlan(createOpen, name, desc)} />
      )}
      {importOpen && (
        <ImportCurriculumModal classId={classId} subjectId={importOpen} onClose={() => setImportOpen(null)} onImported={handleImported} />
      )}
      {canManage && createSubjectOpen && (
        <CreateSubjectModal classId={classId} onClose={() => setCreateSubjectOpen(false)} onCreated={loadPlans} />
      )}
      {selectedPlan && <PlanDetailModal plan={selectedPlan} canManage={canManage} onClose={() => setSelectedPlan(null)} onSaved={loadPlans} />}
    </div>
  );
}

function CreateSubjectModal({ classId, onClose, onCreated }: { classId: string; onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api(`/classes/${classId}/subjects`, { method: 'POST', body: JSON.stringify({ name }) });
      toast.success('Đã thêm môn học');
      onClose();
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Thêm môn học">
      <div className="space-y-3">
        <div><Label>Tên môn học *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Vật lý đại cương" /></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy || !name.trim()}>Thêm</Button></div>
      </div>
    </Modal>
  );
}

export interface TeachingPlan {
  id: string;
  classId: string;
  subjectId: string | null;
  name: string;
  description: string;
  totalPeriods: number;
  items: CurriculumItem[];
}

export interface CurriculumItem {
  id: string;
  week: number | null;
  chapter: string;
  topic: string;
  plannedPeriods: number;
  completedPeriods: number;
  status: 'pending' | 'in_progress' | 'completed';
  sortOrder: number;
  lectureId?: string | null;
}

function CreatePlanModal({ onClose, onCreate }: { subjectId: string; onClose: () => void; onCreate: (name: string, desc: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate(name, desc);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Tạo chương trình đào tạo">
      <div className="space-y-3">
        <div><Label>Tên chương trình *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Chương trình học kỳ 1 2026-2027" /></div>
        <div><Label>Mô tả</Label><Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy || !name.trim()}>Tạo</Button></div>
      </div>
    </Modal>
  );
}

function ImportCurriculumModal({ classId, subjectId, onClose, onImported }: { classId: string; subjectId: string; onClose: () => void; onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  async function downloadTemplate() {
    setDownloadingTemplate(true);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/classes/${classId}/teaching-plans/template.xlsx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Tải file mẫu thất bại');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mau-chuong-trinh-dao-tao-${Date.now()}.xlsx`;
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
      formData.append('subjectId', subjectId);
      const token = useAuthStore.getState().token;
      const res = await fetch(`/api/classes/${classId}/teaching-plans/import-curriculum`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Import failed');
      const data = await res.json();
      toast.success(`Đã tạo ${data.created} mục chương trình (tổng ${data.totalPeriods} tiết)`);
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
    <Modal open onClose={onClose} title="Nhập chương trình đào tạo từ Excel" wide>
      <p className="mb-4 text-sm text-slate-500">
        File cần các cột: <strong>Tuần, Chương/Phần, Chủ đề/Nội dung, Số tiết dự kiến</strong>.
        Bắt buộc có cột <strong>Chủ đề/Nội dung</strong>; các cột còn lại có thể để trống.
        Cột "Tuần" và "Chương/Phần" dùng để tổ chức; "Số tiết" mặc định = 1.
      </p>
      <div className="mb-4">
        <Button variant="secondary" onClick={() => void downloadTemplate()} disabled={downloadingTemplate}>
          <i className="fas fa-file-excel" /> {downloadingTemplate ? 'Đang tải…' : 'Tải file mẫu Excel'}
        </Button>
      </div>
      <input
        aria-label="Chọn file chương trình đào tạo"
        type="file"
        accept=".csv,.xlsx"
        onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
        className="mb-4 block w-full text-sm text-slate-600 file:mr-3 file:rounded-sm file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-700"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
        <Button onClick={() => void submit()} disabled={busy || !file}>{busy ? 'Đang nhập…' : 'Nhập chương trình'}</Button>
      </div>
    </Modal>
  );
}

function PlanDetailModal({ plan, canManage, onClose, onSaved }: { plan: TeachingPlan; canManage: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<CurriculumItem | null>(null);

  async function deleteItem(id: string) {
    if (!window.confirm('Xóa mục này?')) return;
    try {
      await api(`/curriculum-items/${id}`, { method: 'DELETE' });
      toast.success('Đã xóa');
      await onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }

  const pending = plan.items.filter((i) => i.status === 'pending').length;
  const inProgress = plan.items.filter((i) => i.status === 'in_progress').length;
  const completed = plan.items.filter((i) => i.status === 'completed').length;

  return (
    <Modal open onClose={onClose} title={`Chi tiết: ${plan.name}`} wide>
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <span className="px-2 py-1 rounded bg-slate-100 text-slate-600">Chờ: <strong>{pending}</strong></span>
          <span className="px-2 py-1 rounded bg-blue-50 text-blue-700">Đang dạy: <strong>{inProgress}</strong></span>
          <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">Hoàn thành: <strong>{completed}</strong></span>
        </div>
        {canManage && (
          <div className="flex justify-end">
            <Button variant="secondary" className="!py-1.5" onClick={() => setAddOpen(true)}>+ Thêm mục</Button>
          </div>
        )}
        <ul className="max-h-[400px] space-y-1.5 overflow-y-auto pr-1 divide-y divide-slate-200 rounded-sm border border-slate-200">
          {plan.items.map((it) => (
            <li key={it.id} className={`px-3 py-2 ${it.status === 'completed' ? 'bg-emerald-50' : it.status === 'in_progress' ? 'bg-blue-50' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`w-6 text-center font-bold ${it.status === 'completed' ? 'text-emerald-600' : it.status === 'in_progress' ? 'text-blue-600' : 'text-slate-400'}`}>
                  {it.status === 'completed' ? '✓' : it.status === 'in_progress' ? '▶' : '○'}
                </span>
                <span className="text-xs text-slate-500 shrink-0">{it.week ? `T${it.week}` : ''}</span>
                <span className="text-xs text-slate-400 shrink-0">{it.chapter}</span>
                <span className="flex-1 min-w-0 truncate font-medium text-slate-700">{it.topic}</span>
                <span className="shrink-0 text-xs text-slate-500">{it.plannedPeriods} tiết</span>
                <div className="w-32 h-1.5 rounded bg-slate-100">
                  <div className="h-full bg-blue-900 rounded" style={{ width: `${(it.completedPeriods / it.plannedPeriods) * 100}%` }} />
                </div>
                <span className="shrink-0 text-xs text-slate-500">{it.completedPeriods}/{it.plannedPeriods}</span>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setEditItem(it)}>Sửa</Button>
                    <Button variant="ghost" className="!px-2 !py-1 text-xs text-red-600" onClick={() => void deleteItem(it.id)}>Xóa</Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
        {addOpen && <AddItemModal planId={plan.id} onClose={() => setAddOpen(false)} onAdded={onSaved} />}
        {editItem && <EditItemModal item={editItem} onClose={() => setEditItem(null)} onSaved={onSaved} />}
      </div>
    </Modal>
  );
}

function AddItemModal({ planId, onClose, onAdded }: { planId: string; onClose: () => void; onAdded: () => Promise<void> }) {
  const [week, setWeek] = useState<number | null>(null);
  const [chapter, setChapter] = useState('');
  const [topic, setTopic] = useState('');
  const [periods, setPeriods] = useState(1);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!topic.trim()) return;
    setBusy(true);
    try {
      await api(`/teaching-plans/${planId}/items`, { method: 'POST', body: JSON.stringify({ week, chapter, topic, plannedPeriods: periods }) });
      toast.success('Đã thêm');
      onClose();
      await onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Thêm mục chương trình">
      <div className="space-y-3">
        <div><Label>Tuần</Label><Input type="number" min={1} max={52} value={week ?? ''} onChange={(e) => setWeek(e.target.value ? Number(e.target.value) : null)} placeholder="Để trống nếu không áp dụng" /></div>
        <div><Label>Chương/Phần</Label><Input value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="VD: Chương 2" /></div>
        <div><Label>Chủ đề/Nội dung *</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: Phân tích mạch điện" /></div>
        <div><Label>Số tiết dự kiến</Label><Input type="number" min={1} max={50} value={periods} onChange={(e) => setPeriods(Number(e.target.value))} /></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy || !topic.trim()}>Thêm</Button></div>
      </div>
    </Modal>
  );
}

function EditItemModal({ item, onClose, onSaved }: { item: CurriculumItem; onClose: () => void; onSaved: () => Promise<void> }) {
  const [week, setWeek] = useState<number | null>(item.week);
  const [chapter, setChapter] = useState(item.chapter);
  const [topic, setTopic] = useState(item.topic);
  const [periods, setPeriods] = useState(item.plannedPeriods);
  const [status, setStatus] = useState(item.status);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api(`/curriculum-items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ week, chapter, topic, plannedPeriods: periods }) });
      toast.success('Đã cập nhật');
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Sửa mục chương trình">
      <div className="space-y-3">
        <div><Label>Tuần</Label><Input type="number" min={1} max={52} value={week ?? ''} onChange={(e) => setWeek(e.target.value ? Number(e.target.value) : null)} placeholder="Để trống nếu không áp dụng" /></div>
        <div><Label>Chương/Phần</Label><Input value={chapter} onChange={(e) => setChapter(e.target.value)} /></div>
        <div><Label>Chủ đề/Nội dung *</Label><Input value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
        <div><Label>Số tiết dự kiến</Label><Input type="number" min={1} max={50} value={periods} onChange={(e) => setPeriods(Number(e.target.value))} /></div>
        <div><Label>Trạng thái</Label><Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="pending">Chờ</option>
          <option value="in_progress">Đang dạy</option>
          <option value="completed">Hoàn thành</option>
        </Select></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy}>Lưu</Button></div>
      </div>
    </Modal>
  );
}

export function GroupScoresSection({ classId, canManage }: { classId: string; canManage: boolean }) {
  const classNameRef = useRef('');
  const [rows, setRows] = useState<GroupGradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarkFor, setRemarkFor] = useState<GroupGradeRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ classInfo: { id: string; name: string; subject: string }; rows: GroupGradeRow[] }>(`/classes/${classId}/group-grades`);
      classNameRef.current = res.classInfo.name;
      setRows(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  async function update(groupId: string, col: 'kttx' | 'process1' | 'finalExam', value: string) {
    const num = value === '' ? null : Math.min(10, Math.max(0, Number(value)));
    if (value !== '' && Number.isNaN(num as number)) return;
    setRows((rs) => rs.map((r) => (r.groupId === groupId ? { ...r, [col]: num } : r)));
    try {
      await api(`/classes/${classId}/group-grades/${groupId}`, { method: 'PUT', body: JSON.stringify({ [col]: num }) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu điểm');
      await load();
    }
  }

  async function exportExcel() {
    const aoa = [
      [`SỔ ĐIỂM NHÓM — ${classNameRef.current}`],
      [],
      ['STT', 'Tên nhóm', 'KTTX', 'Quá trình 1', 'KT kết thúc môn', 'Nhận xét'],
      ...rows.map((r, i) => [i + 1, r.groupName, r.kttx ?? '', r.process1 ?? '', r.finalExam ?? '', r.remark]),
    ];
    await downloadExcelWorkbook(`diem-nhom-${Date.now()}.xlsx`, 'Điểm nhóm', aoa);
    toast.success('Đã xuất Excel');
  }

  if (loading) return <Spinner />;
  if (rows.length === 0) return <Card><EmptyState message="Lớp chưa có nhóm nào. Tạo nhóm ở tab Nhóm." /></Card>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" onClick={() => void exportExcel()}><i className="fas fa-download" /> Excel</Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Tên nhóm</th>
              <th className="px-4 py-3">KTTX</th>
              <th className="px-4 py-3">Quá trình 1</th>
              <th className="px-4 py-3">KT cuối môn</th>
              <th className="px-4 py-3">Nhận xét</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((r, i) => (
              <tr key={r.groupId} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                <td className="px-4 py-2">{r.groupName}</td>
                {(['kttx', 'process1', 'finalExam'] as const).map((col) => (
                  <td key={col} className="px-4 py-2">
                    {canManage ? (
                      <input
                        aria-label={`Điểm ${col} của nhóm ${r.groupName}`}
                        type="number" min={0} max={10} step={0.25}
                        value={r[col] ?? ''}
                        placeholder="—"
                        onChange={(e) => void update(r.groupId, col, e.target.value)}
                        className="w-16 rounded-sm border border-slate-300 bg-white px-2 py-1 text-center text-sm text-slate-800 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                      />
                    ) : (
                      <span className="font-semibold">{r[col] ?? '—'}</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-2 max-w-[180px]">
                  {canManage ? (
                    <button onClick={() => setRemarkFor(r)} className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs font-medium text-slate-600 hover:bg-slate-100">
                      <i className={`fas ${r.remark ? 'fa-comment text-blue-900' : 'fa-comment-slash text-slate-400'}`} />
                      <span className="truncate">{r.remark || 'Thêm nhận xét'}</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-600">{r.remark || '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {remarkFor && (
        <RemarkModal
          row={remarkFor}
          classId={classId}
          onClose={() => setRemarkFor(null)}
          onSaved={(text) => setRows((rs) => rs.map((r) => (r.groupId === remarkFor.groupId ? { ...r, remark: text } : r)))}
        />
      )}
    </div>
  );
}

interface GroupGradeRow {
  groupId: string;
  groupName: string;
  kttx: number | null;
  process1: number | null;
  finalExam: number | null;
  remark: string;
}

export interface TeachingLecture {
  id: string;
  classId: string;
  subjectId: string | null;
  chapter: string;
  title: string;
  description: string;
  sortOrder: number;
  materials: unknown[];
}

export type ContentMode = 'slides' | 'video' | 'links' | 'game';

export interface PendingFile {
  filename: string;
  sizeBytes: number;
  type: string;
}
