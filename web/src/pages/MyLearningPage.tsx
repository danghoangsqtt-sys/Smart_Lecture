import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, EmptyState, PageHeader, Spinner } from '../components/ui';
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

const TYPE_ICON: Record<string, string> = { pdf: 'ðŸ“•', docx: 'ðŸ“„', pptx: 'ðŸ“Š', video: 'ðŸŽ¬', image: 'ðŸ–¼ï¸', link: 'ðŸ”—' };

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
      toast.error(e instanceof Error ? e.message : 'Lá»—i');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader
        title="Há»c liá»‡u cá»§a tÃ´i"
        subtitle="Xem bÃ i giáº£ng, video vÃ  tÃ i liá»‡u giÃ¡o viÃªn Ä‘Äƒng"
        actions={
          classes.length > 1 ? (
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : undefined
        }
      />
      {!classId ? (
        <Card><EmptyState message="Báº¡n chÆ°a Ä‘Æ°á»£c thÃªm vÃ o lá»›p nÃ o" /></Card>
      ) : loading ? (
        <Spinner />
      ) : lectures.length === 0 ? (
        <Card><EmptyState message="GiÃ¡o viÃªn chÆ°a Ä‘Äƒng bÃ i giáº£ng nÃ o" /></Card>
      ) : (
        <div className="space-y-4">
          {lectures.map((l) => (
            <Card key={l.id} className="p-5">
              {l.chapter && <p className="text-xs font-medium uppercase tracking-wide text-indigo-400">{l.chapter}</p>}
              <h3 className="mt-0.5 font-semibold">{l.title}</h3>
              {l.description && <p className="mt-1 text-sm text-slate-400">{l.description}</p>}
              {l.materials.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {l.materials.map((m) => (
                    <button key={m.id} onClick={() => setViewer({ material: m })} className="rounded-lg bg-slate-800 px-3 py-2 text-sm transition hover:bg-slate-700">
                      {TYPE_ICON[m.type] ?? 'ðŸ“Ž'} {m.title}
                    </button>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4" onMouseDown={(e) => e.target === e.currentTarget && setViewer(null)}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium text-white">{viewer.material.title}</h3>
            <button onClick={() => setViewer(null)} className="rounded-lg px-3 py-1.5 text-slate-300 hover:bg-slate-800">âœ• ÄÃ³ng</button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {viewer.material.type === 'video' && (
              <video controls autoPlay className="max-h-full max-w-full rounded-xl" src={`/api/media/${viewer.material.id}/stream`} />
            )}
            {viewer.material.type === 'image' && (
              <img className="max-h-full max-w-full rounded-xl" src={`/api/media/${viewer.material.id}/stream`} alt={viewer.material.title} />
            )}
            {(viewer.material.type === 'pdf') && (
              <iframe title={viewer.material.title} className="h-full w-full rounded-xl bg-white" src={`/api/media/${viewer.material.id}/stream`} />
            )}
            {(viewer.material.type === 'docx' || viewer.material.type === 'pptx' || viewer.material.type === 'link') && (
              <div className="text-center text-sm text-slate-300">
                {viewer.material.linkUrl ? (
                  <a href={viewer.material.linkUrl} target="_blank" rel="noreferrer" className="text-indigo-400 underline">Má»Ÿ liÃªn káº¿t trong tab má»›i â†—</a>
                ) : (
                  <>
                    <p className="mb-3">Äá»‹nh dáº¡ng nÃ y táº£i vá» Ä‘á»ƒ xem trÃªn thiáº¿t bá»‹ cá»§a báº¡n</p>
                    <a href={`/api/media/${viewer.material.id}/stream`} download className="inline-block rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white">Táº£i xuá»‘ng</a>
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

