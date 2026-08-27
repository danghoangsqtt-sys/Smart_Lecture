import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, EmptyState, PageHeader, Select, Spinner } from '../components/ui';
import toast from '../stores/toastStore';
import { useMyClasses } from './LecturesPage';

interface Material {
  id: string;
  type: string;
  title: string;
  linkUrl: string | null;
}

interface Lecture {
  id: string;
  chapter: string;
  title: string;
  description: string;
  materials: Material[];
}

const TYPE_ICON: Record<string, string> = { pdf: 'fa-file-pdf', docx: 'fa-file-lines', pptx: 'fa-file-powerpoint', video: 'fa-file-video', image: 'fa-file-image', link: 'fa-link' };

export default function MyLearningPage() {
  const classes = useMyClasses();
  const [classId, setClassId] = useState('');
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewer, setViewer] = useState<{ material: Material } | null>(null);

  useEffect(() => {
    if (classes.length > 0 && !classId) setClassId(classes[0].id);
  }, [classes, classId]);

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const res = await api<{ lectures: Lecture[] }>(`/classes/${classId}/lectures`);
      setLectures(res.lectures);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader
        title="Học liệu của tôi"
        subtitle="Xem bài giảng, video và tài liệu giáo viên đăng"
        actions={
          classes.length > 1 ? (
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="max-w-xs">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          ) : undefined
        }
      />
      {!classId ? (
        <Card><EmptyState message="Bạn chưa được thêm vào lớp nào" /></Card>
      ) : loading ? (
        <Spinner />
      ) : lectures.length === 0 ? (
        <Card><EmptyState message="Giáo viên chưa đăng bài giảng nào" /></Card>
      ) : (
        <div className="space-y-4">
          {lectures.map((l) => (
            <Card key={l.id} className="p-5">
              {l.chapter && <p className="text-xs font-medium uppercase tracking-wide text-blue-700">{l.chapter}</p>}
              <h3 className="mt-0.5 font-semibold text-slate-800">{l.title}</h3>
              {l.description && <p className="mt-1 text-sm text-slate-500">{l.description}</p>}
              {l.materials.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {l.materials.map((m) => (
                    <button key={m.id} onClick={() => setViewer({ material: m })} className="inline-flex items-center gap-1.5 rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100">
                      <i className={`fas ${TYPE_ICON[m.type] ?? 'fa-paperclip'} text-blue-700`} /> {m.title}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4">
          <button type="button" aria-label="Đóng trình xem tài liệu" className="absolute inset-0 cursor-default" onClick={() => setViewer(null)} />
          <div className="relative mb-3 flex items-center justify-between">
            <h3 className="font-medium text-white">{viewer.material.title}</h3>
            <button onClick={() => setViewer(null)} className="rounded-sm px-3 py-1.5 text-slate-300 hover:bg-white/10"><i className="fas fa-xmark" /> Đóng</button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            {viewer.material.type === 'video' && (
              <video controls autoPlay muted className="max-h-full max-w-full rounded-sm" src={`/api/media/${viewer.material.id}/stream`} />
            )}
            {viewer.material.type === 'image' && (
              <img className="max-h-full max-w-full rounded-sm" src={`/api/media/${viewer.material.id}/stream`} alt={viewer.material.title} />
            )}
            {(viewer.material.type === 'pdf') && (
              <object aria-label={viewer.material.title} data={`/api/media/${viewer.material.id}/stream`} type="application/pdf" className="h-full w-full rounded-sm bg-white">
                <a href={`/api/media/${viewer.material.id}/stream`} target="_blank" rel="noreferrer" className="text-blue-400 underline">Mở tài liệu PDF trong tab mới ↗</a>
              </object>
            )}
            {(viewer.material.type === 'docx' || viewer.material.type === 'pptx' || viewer.material.type === 'link') && (
              <div className="text-center text-sm text-slate-300">
                {viewer.material.linkUrl ? (
                  <a href={viewer.material.linkUrl} target="_blank" rel="noreferrer" className="text-blue-400 underline">Mở liên kết trong tab mới ↗</a>
                ) : (
                  <>
                    <p className="mb-3">Định dạng này tải về để xem trên thiết bị của bạn</p>
                    <a href={`/api/media/${viewer.material.id}/stream`} download className="inline-block rounded-sm bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500">Tải xuống</a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

