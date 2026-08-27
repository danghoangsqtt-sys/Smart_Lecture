import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, Spinner, Textarea } from '../components/ui';
import toast from '../stores/toastStore';
import { useMyClasses } from './LecturesPage';

interface Question {
  id: string;
  ownerId: string;
  type: 'mcq' | 'essay' | 'fill';
  content: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  bloomLevel: string;
  category: string;
  folderId: string | null;
  subjectId: string | null;
  chapter: string;
  lesson: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface SubjectInfo { id: string; name: string; }

const BLOOM_LEVELS = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'];

export default function QuestionsPage() {
  const [tab, setTab] = useState<'bank' | 'import'>('bank');

  return (
    <div>
      <PageHeader title="Ngân hàng câu hỏi" subtitle="Trắc nghiệm, tự luận & điền chỗ trống — tạo tay, nhập từ file văn bản" />
      <div className="mb-5 flex w-fit gap-1 rounded-sm border border-slate-200 bg-slate-100 p-1">
        {([['bank', 'Ngân hàng'], ['import', 'Nhập từ file']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-sm px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${tab === key ? 'bg-blue-900 text-white shadow-md' : 'text-slate-500 hover:text-blue-900'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'bank' && <BankTab />}
      {tab === 'import' && <ImportTab />}
    </div>
  );
}

function BankTab() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [folderFilter, setFolderFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [bloomFilter, setBloomFilter] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Partial<Question> | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'move' | 'copy' | 'edit' | null>(null);
  const [bulkFolderId, setBulkFolderId] = useState('');
  const [bulkBloomLevel, setBulkBloomLevel] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (bloomFilter) params.set('bloom', bloomFilter);
      if (folderFilter) params.set('folderId', folderFilter);
      if (q) params.set('q', q);
      const res = await api<{ questions: Question[] }>(`/questions?${params}`);
      setQuestions(res.questions);
      setSelectedIds(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, bloomFilter, folderFilter, q]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api<{ folders: { id: string; name: string }[] }>('/questions/folders').then((r) => setFolders(r.folders)).catch(() => undefined);
  }, []);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteQuestion(id: string) {
    if (!window.confirm('Xóa câu hỏi này?')) return;
    try {
      await api(`/questions/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi xóa');
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Xóa ${selectedIds.size} câu hỏi đã chọn?`)) return;
    try {
      await api('/questions/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: [...selectedIds] }) });
      toast.success('Đã xóa hàng loạt');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi xóa hàng loạt');
    }
  }

  async function bulkMove() {
    if (selectedIds.size === 0 || !bulkFolderId) return;
    try {
      await api('/questions/bulk-move', { method: 'POST', body: JSON.stringify({ ids: [...selectedIds], folderId: bulkFolderId }) });
      toast.success(`Đã di chuyển ${selectedIds.size} câu hỏi`);
      setBulkAction(null);
      setBulkFolderId('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi di chuyển');
    }
  }

  async function bulkCopy() {
    if (selectedIds.size === 0 || !bulkFolderId) return;
    try {
      const res = await api<{ copied: number }>('/questions/bulk-copy', { method: 'POST', body: JSON.stringify({ ids: [...selectedIds], folderId: bulkFolderId }) });
      toast.success(`Đã sao chép ${res.copied} câu hỏi`);
      setBulkAction(null);
      setBulkFolderId('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi sao chép');
    }
  }

  async function bulkEdit() {
    if (selectedIds.size === 0) return;
    if (!bulkBloomLevel && !bulkCategory) {
      toast.error('Chọn ít nhất một trường để cập nhật');
      return;
    }
    try {
      await api('/questions/bulk-edit', { method: 'POST', body: JSON.stringify({ ids: [...selectedIds], bloomLevel: bulkBloomLevel || undefined, category: bulkCategory || undefined }) });
      toast.success(`Đã cập nhật ${selectedIds.size} câu hỏi`);
      setBulkAction(null);
      setBulkBloomLevel('');
      setBulkCategory('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi cập nhật');
    }
  }

  async function exportTxt() {
    try {
      const params = new URLSearchParams();
      if (selectedIds.size > 0) params.set('ids', [...selectedIds].join(','));
      else if (typeFilter) params.set('type', typeFilter);
      if (bloomFilter) params.set('bloom', bloomFilter);
      if (folderFilter) params.set('folderId', folderFilter);
      if (q) params.set('q', q);
      const res = await fetch(`/api/questions/export/txt?${params}`, {
        headers: { Authorization: `Bearer ${(await import('../stores/authStore')).useAuthStore.getState().token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `questions-export-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Đã xuất file TXT');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi xuất TXT');
    }
  }

  async function exportDocx() {
    try {
      const params = new URLSearchParams();
      if (selectedIds.size > 0) params.set('ids', [...selectedIds].join(','));
      else if (typeFilter) params.set('type', typeFilter);
      if (bloomFilter) params.set('bloom', bloomFilter);
      if (folderFilter) params.set('folderId', folderFilter);
      if (q) params.set('q', q);
      const res = await fetch(`/api/questions/export/docx?${params}`, {
        headers: { Authorization: `Bearer ${(await import('../stores/authStore')).useAuthStore.getState().token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `questions-export-${Date.now()}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Đã xuất file DOCX');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi xuất DOCX');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <Card className="h-fit p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">Thư mục</h3>
          <span className="text-xs text-slate-500">{questions.length} câu</span>
        </div>
        <ul className="space-y-0.5 text-sm">
          <li>
            <button onClick={() => setFolderFilter('')} className={`w-full rounded-sm px-2 py-1.5 text-left ${!folderFilter ? 'bg-blue-50 font-semibold text-blue-900' : 'text-slate-500 hover:bg-slate-100'}`}>
              Tất cả
            </button>
          </li>
          {folders.map((f) => (
            <li key={f.id}>
              <div className={`group flex w-full items-center justify-between rounded-sm px-2 py-1.5 ${folderFilter === f.id ? 'bg-blue-50 font-semibold text-blue-900' : 'text-slate-500 hover:bg-slate-100'}`}>
                <button type="button" onClick={() => setFolderFilter(f.id)} className="min-w-0 flex-1 text-left">
                  <span className="truncate">{f.name}</span>
                </button>
                <button type="button" onClick={() => { void removeFolder(f.id, load); }} aria-label={`Xóa thư mục ${f.name}`} className="hidden text-xs text-red-600 group-hover:block hover:text-red-700">×</button>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-1">
          <Input placeholder="Thư mục mới…" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="!py-1.5 text-xs" />
          <Button variant="secondary" className="!px-2 !py-1.5" disabled={!newFolderName}
            onClick={async () => {
              try {
                await api('/questions/folders', { method: 'POST', body: JSON.stringify({ name: newFolderName }) });
                const r = await api<{ folders: { id: string; name: string }[] }>('/questions/folders');
                setFolders(r.folders); setNewFolderName('');
              } catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
            }}>+</Button>
        </div>
      </Card>

      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input placeholder="Tìm nội dung…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="max-w-36">
            <option value="">Mọi loại</option><option value="mcq">Trắc nghiệm</option><option value="fill">Điền chỗ trống</option><option value="essay">Tự luận</option>
          </Select>
          <Select value={bloomFilter} onChange={(e) => setBloomFilter(e.target.value)} className="max-w-44">
            <option value="">Mọi mức Bloom</option>
            {BLOOM_LEVELS.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
          <Button variant="secondary" className="ml-auto" onClick={exportTxt}>Xuất TXT</Button>
          <Button variant="secondary" onClick={exportDocx}>Xuất DOCX</Button>
          <Button className="ml-2" onClick={() => setEdit({ type: 'mcq', options: ['', '', '', ''], correctAnswer: 'A', bloomLevel: BLOOM_LEVELS[0], explanation: '', category: '' })}>+ Câu hỏi mới</Button>
        </div>

        {selectedIds.size > 0 && (
          <div className="mb-4 p-3 rounded-sm border border-blue-200 bg-blue-50 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-blue-900">Đã chọn: {selectedIds.size} câu</span>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setBulkAction('move')}>Di chuyển thư mục</Button>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setBulkAction('copy')}>Sao chép thư mục</Button>
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setBulkAction('edit')}>Cập nhật Bloom/Chủ đề</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs text-red-600 hover:bg-red-50" onClick={bulkDelete}>Xóa</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setSelectedIds(new Set())}>Bỏ chọn</Button>
          </div>
        )}

        {bulkAction === 'move' && (
          <div className="mb-4 p-3 rounded-sm border border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2">
            <div className="text-xs font-black uppercase tracking-wider text-slate-500">Thư mục đích:</div>
            <Select value={bulkFolderId} onChange={(e) => setBulkFolderId(e.target.value || '')} className="max-w-48">
              <option value="">— Không thư mục —</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
            <Button className="px-2 py-1 text-xs" onClick={bulkMove}>Xác nhận di chuyển</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setBulkAction(null)}>Hủy</Button>
          </div>
        )}

        {bulkAction === 'copy' && (
          <div className="mb-4 p-3 rounded-sm border border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2">
            <div className="text-xs font-black uppercase tracking-wider text-slate-500">Thư mục đích:</div>
            <Select value={bulkFolderId} onChange={(e) => setBulkFolderId(e.target.value || '')} className="max-w-48">
              <option value="">— Không thư mục —</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
            <Button className="px-2 py-1 text-xs" onClick={bulkCopy}>Xác nhận sao chép</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setBulkAction(null)}>Hủy</Button>
          </div>
        )}

        {bulkAction === 'edit' && (
          <div className="mb-4 p-3 rounded-sm border border-slate-200 bg-slate-50 flex flex-wrap items-center gap-2">
            <div className="text-xs font-black uppercase tracking-wider text-slate-500">Mức Bloom:</div>
            <Select value={bulkBloomLevel} onChange={(e) => setBulkBloomLevel(e.target.value)} className="max-w-40">
              <option value="">— Giữ nguyên —</option>
              {BLOOM_LEVELS.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
            <div className="text-xs font-black uppercase tracking-wider text-slate-500">Chủ đề:</div>
            <Input value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} placeholder="Nhập chủ đề mới" className="max-w-40" />
            <Button className="px-2 py-1 text-xs" onClick={bulkEdit}>Xác nhận cập nhật</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setBulkAction(null)}>Hủy</Button>
          </div>
        )}

        {loading ? <Spinner /> : questions.length === 0 ? (
          <Card><EmptyState message="Không có câu hỏi phù hợp. Tạo câu hỏi đầu tiên hoặc nhập từ file!" /></Card>
        ) : (
          <div className="space-y-3">
            {questions.map((question, i) => (
              <Card key={question.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-center gap-2 cursor-pointer flex-1">
                    <input type="checkbox" checked={selectedIds.has(question.id)} onChange={() => toggleSelect(question.id)} className="rounded border-slate-300 text-blue-900 focus:ring-blue-900" />
                    <p className="text-sm leading-relaxed text-slate-800"><span className="mr-1 font-semibold text-slate-500">{i + 1}.</span>{question.content}</p>
                  </label>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => setEdit(question)} className="rounded-sm px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-blue-900">Sửa</button>
                    <button onClick={() => void deleteQuestion(question.id)} className="rounded-sm px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">Xóa</button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={question.type === 'mcq' ? 'indigo' : question.type === 'fill' ? 'amber' : 'amber'}>{question.type === 'mcq' ? 'Trắc nghiệm' : question.type === 'fill' ? 'Điền chỗ trống' : 'Tự luận'}</Badge>
                  {question.bloomLevel && <Badge>{question.bloomLevel}</Badge>}
                  {question.type === 'mcq' && question.correctAnswer && <Badge tone="green">Đáp án: {question.correctAnswer}</Badge>}
                  {question.category && <Badge tone="slate">{question.category}</Badge>}
                </div>
              </Card>
            ))}
          </div>
        )}

        <EditQuestionModal question={edit} folders={folders} onClose={() => setEdit(null)} onSaved={load} />
      </div>
    </div>
  );
}

async function removeFolder(id: string, reload: () => Promise<void>) {
  if (!window.confirm('Xóa thư mục? Câu hỏi trong thư mục sẽ chuyển ra ngoài.')) return;
  try {
    await api(`/questions/folders/${id}`, { method: 'DELETE' });
    window.location.reload();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Lỗi');
  }
  void reload;
}

function EditQuestionModal({ question, folders, onClose, onSaved }: { question: Partial<Question> | null; folders: { id: string; name: string }[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const isNew = !question?.id;
  const [form, setForm] = useState<Partial<Question>>({});
  const [busy, setBusy] = useState(false);
  const classes = useMyClasses();
  const [classId, setClassId] = useState('');
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);

  useEffect(() => {
    setForm(question ?? {});
  }, [question]);

  useEffect(() => {
    if (!classId) { setSubjects([]); return; }
    api<{ subjects: SubjectInfo[] }>(`/classes/${classId}/subjects`)
      .then((r) => setSubjects(r.subjects))
      .catch(() => setSubjects([]));
  }, [classId]);

  if (!question) return null;

  function set<K extends keyof Question>(key: K, value: Question[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setBusy(true);
    try {
      if (isNew) {
        await api('/questions', { method: 'POST', body: JSON.stringify(form) });
      } else {
        await api(`/questions/${question!.id}`, { method: 'PUT', body: JSON.stringify(form) });
      }
      toast.success(isNew ? 'Đã thêm câu hỏi' : 'Đã cập nhật');
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Câu hỏi mới' : 'Sửa câu hỏi'} wide>
      <div className="space-y-3">
        <div>
          <Label>Nội dung câu hỏi *</Label>
          <Textarea rows={3} value={form.content ?? ''} onChange={(e) => set('content', e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Loại</Label>
            <Select value={form.type} onChange={(e) => set('type', e.target.value as 'mcq' | 'essay' | 'fill')}>
              <option value="mcq">Trắc nghiệm</option><option value="fill">Điền chỗ trống</option><option value="essay">Tự luận</option>
            </Select>
          </div>
          <div>
            <Label>Mức Bloom</Label>
            <Select value={form.bloomLevel ?? ''} onChange={(e) => set('bloomLevel', e.target.value)}>
              <option value="">—</option>{BLOOM_LEVELS.map((b) => <option key={b}>{b}</option>)}
            </Select>
          </div>
          <div>
            <Label>Chủ đề</Label>
            <Input value={form.category ?? ''} onChange={(e) => set('category', e.target.value)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Lớp học</Label>
            <Select value={classId} onChange={(e) => { setClassId(e.target.value); set('subjectId', null); }}>
              <option value="">— Chọn lớp để gắn môn —</option>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Môn học</Label>
            <Select value={form.subjectId ?? ''} onChange={(e) => set('subjectId', e.target.value || null)} disabled={!classId}>
              <option value="">— Chưa gắn môn —</option>
              {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </div>
          <div><Label>Chương</Label><Input value={form.chapter ?? ''} onChange={(e) => set('chapter', e.target.value)} /></div>
          <div><Label>Bài học</Label><Input value={form.lesson ?? ''} onChange={(e) => set('lesson', e.target.value)} /></div>
        </div>
        {form.type === 'mcq' && (
          <div className="space-y-2">
            <Label>Phương án (chọn radio đánh dấu đáp án đúng)</Label>
            {(form.options ?? []).map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              return <div key={letter} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  aria-label={`Chọn phương án ${letter} là đáp án đúng`}
                  checked={(form.correctAnswer ?? '') === letter}
                  onChange={() => set('correctAnswer', letter)}
                />
                <Input value={opt} onChange={(e) => { const opts = [...(form.options ?? [])]; opts[i] = e.target.value; set('options', opts); }} placeholder={`Phương án ${letter}`} />
              </div>
            })}
          </div>
        )}
        {(form.type === 'essay' || form.type === 'fill') && (
          <div><Label>{form.type === 'fill' ? 'Đáp án đúng (so khớp chính xác, không phân biệt hoa/thường)' : 'Đáp án / dàn ý tham khảo'}</Label>
            <Textarea rows={form.type === 'fill' ? 1 : 3} value={form.correctAnswer ?? ''} onChange={(e) => set('correctAnswer', e.target.value)} />
          </div>
        )}
        <div><Label>Lời giải</Label><Textarea rows={2} value={form.explanation ?? ''} onChange={(e) => set('explanation', e.target.value)} /></div>
        <div>
          <Label>Thư mục</Label>
          <Select value={form.folderId ?? ''} onChange={(e) => set('folderId', e.target.value || null)}>
            <option value="">— Không thư mục —</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={() => void save()} disabled={busy || !form.content}>Lưu câu hỏi</Button>
        </div>
      </div>
    </Modal>
  );
}

function ImportTab() {
  const classes = useMyClasses();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ questions: any[]; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [folderId, setFolderId] = useState('');
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [subjects, setSubjects] = useState<SubjectInfo[]>([]);
  const [chapter, setChapter] = useState('');
  const [lesson, setLesson] = useState('');
  const [difficulty, setDifficulty] = useState<Question['difficulty']>('medium');

  useEffect(() => {
    api<{ folders: { id: string; name: string }[] }>('/questions/folders').then((r) => setFolders(r.folders)).catch(() => undefined);
  }, []);

  useEffect(() => {
    setSubjectId('');
    if (!classId) { setSubjects([]); return; }
    api<{ subjects: SubjectInfo[] }>(`/classes/${classId}/subjects`)
      .then((result) => setSubjects(result.subjects))
      .catch(() => setSubjects([]));
  }, [classId]);

  function readFile(file: File) {
    setFile(file);
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? '').slice(0, 2_000_000));
    reader.readAsText(file);
  }

  async function previewImport() {
    if (!file) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (folderId) formData.append('folderId', folderId);
      if (subjectId) formData.append('subjectId', subjectId);
      formData.append('chapter', chapter);
      formData.append('lesson', lesson);
      formData.append('difficulty', difficulty);
      const token = (await import('../stores/authStore')).useAuthStore.getState().token;
      const res = await fetch('/api/questions/import-file', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Preview failed');
      const data = await res.json();
      setPreview(data);
      setWarnings(data.warnings);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi xem trước');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <p className="mb-3 text-sm text-slate-500">
        Hỗ trợ file: <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">.txt</code>, <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">.md</code>, <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">.docx</code>, <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">.pdf</code>.
        Định dạng nội dung: <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">Câu 1:</code> … phương án <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">A.</code> <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">B.</code>…
        Đáp án đúng đánh dấu <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">*</code> (vd. <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">*A. phương án đúng</code>), hoặc bảng đáp án cuối đề <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">1A 2B 3C</code>.
        Thẻ ảnh <code className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-slate-700">[img:ten_anh]</code> được nhận diện. Phần tự luận bắt đầu bằng "PHẦN II".
      </p>
      <div className="mb-3 flex items-center gap-2">
        <Label>Lưu vào thư mục:</Label>
        <Select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
          <option value="">— Không —</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
      </div>
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <Label>Lớp học</Label>
          <Select value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">— Chọn lớp —</option>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </div>
        <div>
          <Label>Môn học *</Label>
          <Select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} disabled={!classId}>
            <option value="">— Chọn môn —</option>
            {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </div>
        <div><Label>Chương</Label><Input value={chapter} onChange={(event) => setChapter(event.target.value)} /></div>
        <div><Label>Bài học</Label><Input value={lesson} onChange={(event) => setLesson(event.target.value)} /></div>
        <div>
          <Label>Độ khó</Label>
          <Select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Question['difficulty'])}>
            <option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option>
          </Select>
        </div>
      </div>
      <input type="file" aria-label="Chọn tệp câu hỏi để nhập" accept=".txt,.md,.docx,.pdf" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} className="mb-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-sm file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold file:text-slate-700" />
      <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Câu 1: Nội dung câu hỏi…\n*A. phương án đúng\nB. phương án B\n…\nĐáp án: giải thích…'} />
      <div className="mt-3 flex items-center justify-between">
        <Button variant="secondary" onClick={previewImport} disabled={busy || !file || !subjectId}>
          {busy ? 'Đang đọc…' : 'Xem trước & Import'}
        </Button>
        {preview && (
          <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => { setPreview(null); setFile(null); setText(''); setWarnings([]); }}>Nhập lại</Button>
        )}
      </div>
      {warnings.length > 0 && (
        <details className="mt-3 text-xs text-amber-700">
          <summary className="cursor-pointer">{warnings.length} cảnh báo</summary>
          <ul className="mt-1 list-disc pl-4">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </details>
      )}
      {preview && (
        <div className="mt-4 p-3 rounded-sm border border-emerald-200 bg-emerald-50">
          <p className="text-sm font-semibold text-emerald-900">✓ Đã import thành công {preview.questions.length} câu hỏi</p>
          <p className="text-xs text-emerald-700">Nhấn "Nhập lại" để import file khác.</p>
        </div>
      )}
    </Card>
  );
}
