import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, Spinner } from '../components/ui';
import toast from '../stores/toastStore';
import { useMyClasses } from './LecturesPage';

interface Question {
  id: string;
  type: 'mcq' | 'essay';
  content: string;
  bloomLevel: string;
  folderId: string | null;
}

interface ExamInfo {
  id: string;
  title: string;
  durationMin: number;
  questionCount: number;
  status: string;
  config: {
    startAt: string | null;
    endAt: string | null;
    hasPassword: boolean;
    maxAttempts: number;
    purpose: string;
    classId: string | null;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
  };
}

const BLOOM_LEVELS = ['Nháº­n biáº¿t', 'ThÃ´ng hiá»ƒu', 'Váº­n dá»¥ng', 'Váº­n dá»¥ng cao'];

export default function ExamsPage() {
  const [exams, setExams] = useState<ExamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const classes = useMyClasses();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ exams: ExamInfo[] }>('/exams/mine');
      setExams(res.exams);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i táº£i Ä‘á» thi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader title="Äá» thi" subtitle="Soáº¡n Ä‘á» tá»« ngÃ¢n hÃ ng cÃ¢u há»i theo ma tráº­n Bloom" actions={<Button onClick={() => setCreateOpen(true)}>+ Soáº¡n Ä‘á» má»›i</Button>} />
      {loading ? <Spinner /> : exams.length === 0 ? (
        <Card><EmptyState message="ChÆ°a cÃ³ Ä‘á» thi nÃ o" /></Card>
      ) : (
        <div className="space-y-3">
          {exams.map((e) => (
            <Card key={e.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <h3 className="font-medium text-slate-100">{e.title}</h3>
                <p className="mt-0.5 text-xs text-slate-400">
                  {e.questionCount} cÃ¢u Â· {e.durationMin} phÃºt Â· tá»‘i Ä‘a {e.config.maxAttempts} lÆ°á»£t
                  {e.config.hasPassword && ' Â· ðŸ”’ cÃ³ máº­t kháº©u'}
                  {e.config.purpose === 'homework' ? ' · BTVN' : ''}
                </p>
                <p className="text-xs text-slate-500">
                  Lá»›p: {classes.find((c) => c.id === e.config.classId)?.name ?? 'â€”'}
                  {e.config.startAt && ` Â· má»Ÿ ${new Date(e.config.startAt).toLocaleString('vi-VN')}`}
                  {e.config.endAt && ` â†’ Ä‘Ã³ng ${new Date(e.config.endAt).toLocaleString('vi-VN')}`}
                </p>
              </div>
              <span className={`rounded-md px-2 py-1 text-xs font-medium ring-1 ${e.status === 'published' ? 'bg-emerald-950 text-emerald-400 ring-emerald-800' : 'bg-slate-800 text-slate-400 ring-slate-700'}`}>
                {e.status === 'published' ? 'Äang phÃ¡t hÃ nh' : 'ÄÃ£ Ä‘Ã³ng'}
              </span>
              <Link to={`/exams/${e.id}/results`} className="rounded-lg bg-indigo-600/90 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500">Káº¿t quáº£</Link>
              <button
                onClick={async () => {
                  if (!window.confirm(e.status === 'published' ? 'ÄÃ³ng Ä‘á» thi (há»c viÃªn khÃ´ng vÃ o Ä‘Æ°á»£c ná»¯a)?' : 'PhÃ¡t hÃ nh láº¡i Ä‘á» thi?')) return;
                  try {
                    await api(`/exams/${e.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: e.status === 'published' ? 'closed' : 'published' }) });
                    await load();
                  } catch (err) { toast.error(err instanceof Error ? err.message : 'Lá»—i'); }
                }}
                className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                {e.status === 'published' ? 'ÄÃ³ng' : 'Má»Ÿ láº¡i'}
              </button>
              <button
                onClick={async () => {
                  if (!window.confirm('XÃ³a Ä‘á» thi? Káº¿t quáº£ thi liÃªn quan cÅ©ng bá»‹ xÃ³a.')) return;
                  try {
                    await api(`/exams/${e.id}`, { method: 'DELETE' });
                    toast.success('ÄÃ£ xÃ³a');
                    await load();
                  } catch (err) { toast.error(err instanceof Error ? err.message : 'Lá»—i'); }
                }}
                className="rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-950/40"
              >
                XÃ³a
              </button>
            </Card>
          ))}
        </div>
      )}
      <CreateExamModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
    </div>
  );
}

function CreateExamModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState('');
  const [durationMin, setDurationMin] = useState(45);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [matrix, setMatrix] = useState<Record<string, number>>({});
  const [folderId, setFolderId] = useState('');
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [config, setConfig] = useState({ startAt: '', endAt: '', password: '', maxAttempts: 1, purpose: 'online_test', classId: '', shuffleQ: true, shuffleO: true });
  const [busy, setBusy] = useState(false);
  const classes = useMyClasses();

  useEffect(() => {
    if (open) {
      api<{ questions: Question[] }>('/questions?limit=1000').then((r) => setQuestions(r.questions)).catch(() => undefined);
      api<{ folders: { id: string; name: string }[] }>('/questions/folders').then((r) => setFolders(r.folders)).catch(() => undefined);
    }
  }, [open]);

  function autoPick() {
    const pool = questions.filter((question) => (!folderId || question.folderId === folderId));
    const picked = new Set<string>();
    let shortage = false;
    for (const level of BLOOM_LEVELS) {
      const need = matrix[level] ?? 0;
      const candidates = pool.filter((question) => question.bloomLevel === level && !picked.has(question.id));
      if (candidates.length < need) shortage = true;
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const ti = candidates[i]; const tj = candidates[j];
        if (ti && tj) { candidates[i] = tj; candidates[j] = ti; }
      }
      for (const c of candidates.slice(0, need)) picked.add(c.id);
    }
    setSelectedIds(picked);
    if (shortage) toast.info('Má»™t sá»‘ má»©c Bloom khÃ´ng Ä‘á»§ cÃ¢u trong kho â€” Ä‘Ã£ chá»n háº¿t má»©c Ä‘Ã³');
    else toast.success(`ÄÃ£ chá»n ${picked.size} cÃ¢u theo ma tráº­n`);
  }

  async function submit() {
    if (selectedIds.size === 0) { toast.error('ChÆ°a chá»n cÃ¢u há»i nÃ o'); return; }
    setBusy(true);
    try {
      await api('/exams', {
        method: 'POST',
        body: JSON.stringify({
          title,
          durationMin,
          questionIds: [...selectedIds],
          config: {
            start_at: config.startAt || null,
            end_at: config.endAt || null,
            password: config.password || undefined,
            shuffle_questions: config.shuffleQ,
            shuffle_options: config.shuffleO,
            max_attempts: Number(config.maxAttempts),
            purpose: config.purpose,
            class_id: config.classId || null,
          },
        }),
      });
      toast.success('ÄÃ£ táº¡o vÃ  phÃ¡t hÃ nh Ä‘á» thi');
      onClose(); setStep(1); setSelectedIds(new Set());
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i táº¡o Ä‘á»');
    } finally {
      setBusy(false);
    }
  }

  const previewPool = questions.filter((question) => selectedIds.has(question.id));

  return (
    <Modal open={open} onClose={onClose} title="Soáº¡n Ä‘á» thi" wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>TÃªn Ä‘á» *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Thá»i lÆ°á»£ng (phÃºt)</Label><Input type="number" min={1} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} /></div>
        </div>

        <div className="rounded-xl p-4 ring-1 ring-slate-800">
          <h4 className="mb-2 text-sm font-medium text-slate-300">Ma tráº­n Bloom â†’ sá»‘ cÃ¢u mong muá»‘n</h4>
          <div className="grid grid-cols-4 gap-2">
            {BLOOM_LEVELS.map((b) => (
              <div key={b}>
                <Label>{b}</Label>
                <Input type="number" min={0} value={matrix[b] ?? ''} onChange={(e) => setMatrix((m) => ({ ...m, [b]: Number(e.target.value) }))} className="text-center" />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <div className="flex-1"><Label>Kho nguá»“n</Label>
              <Select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                <option value="">Táº¥t cáº£ cÃ¢u há»i cá»§a tÃ´i</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </div>
            <Button variant="secondary" className="mb-[1px]" onClick={autoPick}>ðŸŽ² Chá»n tá»± Ä‘á»™ng theo ma tráº­n</Button>
          </div>
          <p className="mt-2 text-xs text-slate-400">ÄÃ£ chá»n: <b className="text-indigo-300">{selectedIds.size}</b> cÃ¢u. CÃ³ thá»ƒ tick thá»§ cÃ´ng bÃªn dÆ°á»›i.</p>
        </div>

        <details className="rounded-xl ring-1 ring-slate-800" open={step === 2}>
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-slate-300">Chá»n chi tiáº¿t cÃ¢u há»i ({previewPool.length})</summary>
          <ul className="max-h-56 space-y-0.5 overflow-y-auto px-3 pb-3">
            {questions.map((question) => (
              <li key={question.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-800">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedIds.has(question.id)}
                    onChange={(e) =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(question.id); else next.delete(question.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{question.content}</span>
                  <BadgeMini tone={question.type === 'mcq' ? 'indigo' : 'amber'}>{question.type === 'mcq' ? 'TN' : 'TL'}</BadgeMini>
                  {question.bloomLevel && <span className="shrink-0 text-xs text-slate-500">{question.bloomLevel}</span>}
                </label>
              </li>
            ))}
          </ul>
        </details>

        <div className="grid gap-3 rounded-xl p-4 ring-1 ring-slate-800 sm:grid-cols-2">
          <div><Label>Má»Ÿ lÃºc (tÃ¹y chá»n)</Label><Input type="datetime-local" value={config.startAt} onChange={(e) => setConfig((c) => ({ ...c, startAt: e.target.value }))} /></div>
          <div><Label>ÄÃ³ng lÃºc (tÃ¹y chá»n)</Label><Input type="datetime-local" value={config.endAt} onChange={(e) => setConfig((c) => ({ ...c, endAt: e.target.value }))} /></div>
          <div><Label>Máº­t kháº©u phÃ²ng thi</Label><Input value={config.password} onChange={(e) => setConfig((c) => ({ ...c, password: e.target.value }))} placeholder="Bá» trá»‘ng náº¿u khÃ´ng dÃ¹ng" /></div>
          <div><Label>Sá»‘ lÆ°á»£t lÃ m tá»‘i Ä‘a</Label><Input type="number" min={1} max={99} value={config.maxAttempts} onChange={(e) => setConfig((c) => ({ ...c, maxAttempts: Number(e.target.value) }))} /></div>
          <div><Label>Giao cho lá»›p</Label>
            <Select value={config.classId} onChange={(e) => setConfig((c) => ({ ...c, classId: e.target.value }))}>
              <option value="">â€” Chá»n lá»›p â€”</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div><Label>Má»¥c Ä‘Ã­ch</Label>
            <Select value={config.purpose} onChange={(e) => setConfig((c) => ({ ...c, purpose: e.target.value }))}>
              <option value="online_test">Kiá»ƒm tra online</option>
              <option value="homework">Bài tập về nhà</option>
            </Select>
          </div>
          <div className="flex items-end space-x-4 text-sm text-slate-300">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={config.shuffleQ} onChange={(e) => setConfig((c) => ({ ...c, shuffleQ: e.target.checked }))} /> XÃ¡o cÃ¢u</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={config.shuffleO} onChange={(e) => setConfig((c) => ({ ...c, shuffleO: e.target.checked }))} /> XÃ¡o phÆ°Æ¡ng Ã¡n</label>
          </div>
        </div>


        <div className="flex justify-between">
          <p className="pt-2 text-xs text-slate-400">XÃ¡o trá»™n dÃ¹ng thuáº­t toÃ¡n Fisherâ€“Yates, Ä‘Ã¡p Ã¡n Ä‘Ãºng luÃ´n Ä‘Æ°á»£c báº£o toÃ n.</p>
          <Button onClick={() => void submit()} disabled={busy || !title || selectedIds.size === 0}>Táº¡o Ä‘á» & phÃ¡t hÃ nh</Button>
        </div>
      </div>
    </Modal>
  );
}

function BadgeMini({ tone, children }: { tone?: string; children: React.ReactNode }) {
  return <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${tone === 'indigo' ? 'bg-indigo-950 text-indigo-300' : 'bg-amber-950 text-amber-400'}`}>{children}</span>;
}
