import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, Spinner, Textarea } from '../components/ui';
import toast from '../stores/toastStore';
import { useAuthStore } from '../stores/authStore';

interface Material {
  id: string;
  type: string;
  title: string;
  linkUrl: string | null;
  originalName: string;
  sizeBytes: number;
}

interface Lecture {
  id: string;
  chapter: string;
  title: string;
  description: string;
  sortOrder: number;
  materials: Material[];
}

interface ClassInfo {
  id: string;
  name: string;
}

const TYPE_ICON: Record<string, string> = { pdf: 'fa-file-pdf', docx: 'fa-file-lines', pptx: 'fa-file-powerpoint', video: 'fa-file-video', image: 'fa-file-image', link: 'fa-link' };

export function useMyClasses() {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  useEffect(() => {
    api<{ classes: ClassInfo[] }>('/classes/mine')
      .then((r) => setClasses(r.classes))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Lỗi'));
  }, []);
  return classes;
}

export default function LecturesPage() {
  const classes = useMyClasses();
  const token = useAuthStore((s) => s.token);
  const [selectedClassId, setSelectedClassId] = useState('');
  const classId = selectedClassId || classes[0]?.id || '';
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [uploadFor, setUploadFor] = useState<string | null>(null);

  const loadLectures = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const res = await api<{ lectures: Lecture[] }>(`/classes/${classId}/lectures`);
      setLectures(res.lectures);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải bài giảng');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void loadLectures();
  }, [loadLectures]);

  return (
    <div>
      <PageHeader
        title="Bài giảng"
        subtitle="Quản lý bài giảng, video và tài liệu theo lớp"
        actions={<Select value={classId} onChange={(e) => setSelectedClassId(e.target.value)} className="max-w-xs">
          <option value="" disabled>— Chọn lớp —</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>}
      />
      {!classId ? (
        <Card><EmptyState message="Bạn chưa có lớp nào. Hãy tạo lớp trước." /></Card>
      ) : loading ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setAddOpen(true)}>+ Thêm bài giảng</Button>
          </div>
          {lectures.length === 0 ? (
            <Card><EmptyState message="Chưa có bài giảng nào trong lớp này" /></Card>
          ) : (
            <div className="space-y-4">
              {lectures.map((l) => (
                <Card key={l.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {l.chapter && <p className="text-xs font-medium uppercase tracking-wide text-blue-700">{l.chapter}</p>}
                      <h3 className="mt-0.5 font-semibold text-slate-800">{l.title}</h3>
                      {l.description && <p className="mt-1 text-sm text-slate-500">{l.description}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" className="!px-2 !py-1" onClick={() => setUploadFor(l.id)}>+ Tài liệu</Button>
                      <Button
                        variant="ghost"
                        className="!px-2 !py-1 text-red-600 hover:bg-red-50"
                        onClick={async () => {
                          if (!window.confirm(`Xóa bài "${l.title}" cùng toàn bộ tài liệu?`)) return;
                          try {
                            await api(`/lectures/${l.id}`, { method: 'DELETE' });
                            toast.success('Đã xóa bài giảng');
                            await loadLectures();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : 'Lỗi');
                          }
                        }}
                      >
                        Xóa
                      </Button>
                    </div>
                  </div>
                  {l.materials.length > 0 && (
                    <ul className="mt-4 divide-y divide-slate-200 rounded-sm border border-slate-200">
                      {l.materials.map((m) => (
                        <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <i className={`fas ${TYPE_ICON[m.type] ?? 'fa-paperclip'} text-blue-700`} />
                          <span className="flex-1 truncate text-slate-700">{m.title}</span>
                          {m.type !== 'link' && m.sizeBytes > 0 && (
                            <span className="text-xs text-slate-500">{(m.sizeBytes / 1024 / 1024).toFixed(1)}MB</span>
                          )}
                          <a href={`/api/media/${m.id}/stream?token=${encodeURIComponent(token ?? '')}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 hover:text-blue-900">Xem</a>
                          <button
                            onClick={async () => {
                              try {
                                await api(`/materials/${m.id}`, { method: 'DELETE' });
                                await loadLectures();
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Lỗi');
                              }
                            }}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            Xóa
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      <AddLectureModal open={addOpen} classId={classId} onClose={() => setAddOpen(false)} onCreated={loadLectures} />
      <UploadMaterialModal lectureId={uploadFor} onClose={() => setUploadFor(null)} onUploaded={loadLectures} />
    </div>
  );
}

function AddLectureModal({ open, classId, onClose, onCreated }: { open: boolean; classId: string; onClose: () => void; onCreated: () => Promise<void> }) {
  const [chapter, setChapter] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api(`/classes/${classId}/lectures`, { method: 'POST', body: JSON.stringify({ chapter, title, description }) });
      toast.success('Đã thêm bài giảng');
      setChapter(''); setTitle(''); setDescription('');
      onClose();
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open && !!classId} onClose={onClose} title="Bài giảng mới">
      <div className="space-y-3">
        <div><Label>Chương / phần</Label><Input value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="VD: Chương 2" /></div>
        <div><Label>Tiêu đề *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>Mô tả</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy || !title}>Thêm</Button></div>
      </div>
    </Modal>
  );
}

function UploadMaterialModal({ lectureId, onClose, onUploaded }: { lectureId: string | null; onClose: () => void; onUploaded: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function uploadFile() {
    if (!lectureId || !file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = (await import('../stores/authStore')).useAuthStore.getState().token;
      const res = await fetch(`/api/lectures/${lectureId}/materials`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Tải lên thất bại');
      }
      toast.success('Đã tải tài liệu lên');
      setFile(null);
      onClose();
      await onUploaded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải lên');
    } finally {
      setBusy(false);
    }
  }

  async function addLink() {
    if (!lectureId || !linkUrl) return;
    setBusy(true);
    try {
      await api(`/lectures/${lectureId}/materials/link`, { method: 'POST', body: JSON.stringify({ title: linkTitle || linkUrl, linkUrl }) });
      toast.success('Đã thêm liên kết');
      setLinkTitle(''); setLinkUrl('');
      onClose();
      await onUploaded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Link không hợp lệ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!lectureId} onClose={onClose} title="Thêm tài liệu">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Tệp (PDF, DOCX, PPTX, MP4/Webm ≤500MB, ảnh ≤50MB)</Label>
          <input type="file" aria-label="Chọn tài liệu bài giảng" accept=".pdf,.docx,.pptx,.mp4,.webm,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-sm file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-700" />
          <Button onClick={() => void uploadFile()} disabled={busy || !file}>Tải lên</Button>
        </div>
        <div className="border-t border-slate-200 pt-4 space-y-2">
          <Label>Hoặc dán liên kết ngoài (YouTube…)</Label>
          <Input placeholder="Tiêu đề" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
          <Input placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <Button variant="secondary" onClick={() => void addLink()} disabled={busy || !linkUrl}>Thêm link</Button>
        </div>
      </div>
    </Modal>
  );
}
