import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, Spinner, Textarea } from '../components/ui';
import toast from '../stores/toastStore';

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

const TYPE_ICON: Record<string, string> = { pdf: 'ðŸ“•', docx: 'ðŸ“„', pptx: 'ðŸ“Š', video: 'ðŸŽ¬', image: 'ðŸ–¼ï¸', link: 'ðŸ”—' };

export function useMyClasses() {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  useEffect(() => {
    api<{ classes: ClassInfo[] }>('/classes/mine')
      .then((r) => setClasses(r.classes))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Lá»—i'));
  }, []);
  return classes;
}

export default function LecturesPage() {
  const classes = useMyClasses();
  const [classId, setClassId] = useState('');
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [uploadFor, setUploadFor] = useState<string | null>(null);

  useEffect(() => {
    if (classes.length > 0 && !classId) setClassId(classes[0].id);
  }, [classes, classId]);

  const loadLectures = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const res = await api<{ lectures: Lecture[] }>(`/classes/${classId}/lectures`);
      setLectures(res.lectures);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i táº£i bÃ i giáº£ng');
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
        title="BÃ i giáº£ng"
        subtitle="Quáº£n lÃ½ bÃ i giáº£ng, video vÃ  tÃ i liá»‡u theo lá»›p"
        actions={<Select value={classId} onChange={(e) => setClassId(e.target.value)} className="max-w-xs">
          <option value="" disabled>â€” Chá»n lá»›p â€”</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>}
      />
      {!classId ? (
        <Card><EmptyState message="Báº¡n chÆ°a cÃ³ lá»›p nÃ o. HÃ£y táº¡o lá»›p trÆ°á»›c." /></Card>
      ) : loading ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setAddOpen(true)}>+ ThÃªm bÃ i giáº£ng</Button>
          </div>
          {lectures.length === 0 ? (
            <Card><EmptyState message="ChÆ°a cÃ³ bÃ i giáº£ng nÃ o trong lá»›p nÃ y" /></Card>
          ) : (
            <div className="space-y-4">
              {lectures.map((l) => (
                <Card key={l.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {l.chapter && <p className="text-xs font-medium uppercase tracking-wide text-indigo-400">{l.chapter}</p>}
                      <h3 className="mt-0.5 font-semibold text-slate-100">{l.title}</h3>
                      {l.description && <p className="mt-1 text-sm text-slate-400">{l.description}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => setUploadFor(l.id)} className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">+ TÃ i liá»‡u</button>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`XÃ³a bÃ i "${l.title}" cÃ¹ng toÃ n bá»™ tÃ i liá»‡u?`)) return;
                          try {
                            await api(`/lectures/${l.id}`, { method: 'DELETE' });
                            toast.success('ÄÃ£ xÃ³a bÃ i giáº£ng');
                            await loadLectures();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : 'Lá»—i');
                          }
                        }}
                        className="rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-950/40"
                      >
                        XÃ³a
                      </button>
                    </div>
                  </div>
                  {l.materials.length > 0 && (
                    <ul className="mt-4 divide-y divide-slate-800 rounded-xl ring-1 ring-slate-800">
                      {l.materials.map((m) => (
                        <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <span>{TYPE_ICON[m.type] ?? 'ðŸ“Ž'}</span>
                          <span className="flex-1 truncate">{m.title}</span>
                          {m.type !== 'link' && m.sizeBytes > 0 && (
                            <span className="text-xs text-slate-500">{(m.sizeBytes / 1024 / 1024).toFixed(1)}MB</span>
                          )}
                          <a href={`/api/media/${m.id}/stream`} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300">Xem</a>
                          <button
                            onClick={async () => {
                              try {
                                await api(`/materials/${m.id}`, { method: 'DELETE' });
                                await loadLectures();
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Lá»—i');
                              }
                            }}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            XÃ³a
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
      toast.success('ÄÃ£ thÃªm bÃ i giáº£ng');
      setChapter(''); setTitle(''); setDescription('');
      onClose();
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open && !!classId} onClose={onClose} title="BÃ i giáº£ng má»›i">
      <div className="space-y-3">
        <div><Label>ChÆ°Æ¡ng / pháº§n</Label><Input value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="VD: ChÆ°Æ¡ng 2" /></div>
        <div><Label>TiÃªu Ä‘á» *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>MÃ´ táº£</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="flex justify-end pt-2"><Button onClick={() => void submit()} disabled={busy || !title}>ThÃªm</Button></div>
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
        throw new Error(body.error?.message ?? 'Táº£i lÃªn tháº¥t báº¡i');
      }
      toast.success('ÄÃ£ táº£i tÃ i liá»‡u lÃªn');
      setFile(null);
      onClose();
      await onUploaded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i táº£i lÃªn');
    } finally {
      setBusy(false);
    }
  }

  async function addLink() {
    if (!lectureId || !linkUrl) return;
    setBusy(true);
    try {
      await api(`/lectures/${lectureId}/materials/link`, { method: 'POST', body: JSON.stringify({ title: linkTitle || linkUrl, linkUrl }) });
      toast.success('ÄÃ£ thÃªm liÃªn káº¿t');
      setLinkTitle(''); setLinkUrl('');
      onClose();
      await onUploaded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Link khÃ´ng há»£p lá»‡');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!lectureId} onClose={onClose} title="ThÃªm tÃ i liá»‡u">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Tá»‡p (PDF, DOCX, PPTX, MP4/Webm â‰¤500MB, áº£nh â‰¤50MB)</Label>
          <input type="file" accept=".pdf,.docx,.pptx,.mp4,.webm,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200" />
          <Button onClick={() => void uploadFile()} disabled={busy || !file}>Táº£i lÃªn</Button>
        </div>
        <div className="border-t border-slate-800 pt-4 space-y-2">
          <Label>Hoáº·c dÃ¡n liÃªn káº¿t ngoÃ i (YouTubeâ€¦)</Label>
          <Input placeholder="TiÃªu Ä‘á»" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
          <Input placeholder="https://â€¦" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <Button variant="secondary" onClick={() => void addLink()} disabled={busy || !linkUrl}>ThÃªm link</Button>
        </div>
      </div>
    </Modal>
  );
}
