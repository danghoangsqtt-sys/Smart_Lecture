import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, Spinner, Textarea } from '../components/ui';
import toast from '../stores/toastStore';

interface Question {
  id: string;
  ownerId: string;
  type: 'mcq' | 'essay';
  content: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  bloomLevel: string;
  category: string;
  folderId: string | null;
}

const BLOOM_LEVELS = ['Nháº­n biáº¿t', 'ThÃ´ng hiá»ƒu', 'Váº­n dá»¥ng', 'Váº­n dá»¥ng cao'];

export default function QuestionsPage() {
  const [tab, setTab] = useState<'bank' | 'ai' | 'import'>('bank');

  return (
    <div>
      <PageHeader title="NgÃ¢n hÃ ng cÃ¢u há»i" subtitle="Tráº¯c nghiá»‡m & tá»± luáº­n â€” táº¡o tay, sinh báº±ng AI hoáº·c nháº­p tá»« vÄƒn báº£n" />
      <div className="mb-5 flex gap-1 rounded-xl bg-slate-900 p-1 ring-1 ring-slate-800 w-fit">
        {([['bank', 'NgÃ¢n hÃ ng'], ['ai', 'Sinh báº±ng AI'], ['import', 'Nháº­p tá»« vÄƒn báº£n']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === key ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'bank' && <BankTab />}
      {tab === 'ai' && <AiTab onSaved={() => setTab('bank')} />}
      {tab === 'import' && <ImportTab onImported={() => setTab('bank')} />}
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i táº£i');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, bloomFilter, folderFilter, q]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api<{ folders: { id: string; name: string }[] }>('/questions/folders').then((r) => setFolders(r.folders)).catch(() => undefined);
  }, []);

  async function deleteQuestion(id: string) {
    if (!window.confirm('XÃ³a cÃ¢u há»i nÃ y?')) return;
    try {
      await api(`/questions/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i xÃ³a');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <Card className="h-fit p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">ThÆ° má»¥c</h3>
          <span className="text-xs text-slate-500">{questions.length} cÃ¢u</span>
        </div>
        <ul className="space-y-0.5 text-sm">
          <li>
            <button onClick={() => setFolderFilter('')} className={`w-full rounded-md px-2 py-1.5 text-left ${!folderFilter ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:bg-slate-800'}`}>
              Táº¥t cáº£
            </button>
          </li>
          {folders.map((f) => (
            <li key={f.id}>
              <button onClick={() => setFolderFilter(f.id)} className={`group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left ${folderFilter === f.id ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:bg-slate-800'}`}>
                <span className="truncate">{f.name}</span>
                <button onClick={(e) => { e.stopPropagation(); void removeFolder(f.id, load); }} className="hidden text-xs text-red-400 group-hover:block">Ã—</button>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-1">
          <Input placeholder="ThÆ° má»¥c má»›iâ€¦" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="!py-1.5 text-xs" />
          <Button variant="secondary" className="!px-2 !py-1.5" disabled={!newFolderName}
            onClick={async () => {
              try {
                await api('/questions/folders', { method: 'POST', body: JSON.stringify({ name: newFolderName }) });
                const r = await api<{ folders: { id: string; name: string }[] }>('/questions/folders');
                setFolders(r.folders); setNewFolderName('');
              } catch (e) { toast.error(e instanceof Error ? e.message : 'Lá»—i'); }
            }}>+</Button>
        </div>
      </Card>

      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input placeholder="TÃ¬m ná»™i dungâ€¦" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="max-w-36">
            <option value="">Má»i loáº¡i</option><option value="mcq">Tráº¯c nghiá»‡m</option><option value="essay">Tá»± luáº­n</option>
          </Select>
          <Select value={bloomFilter} onChange={(e) => setBloomFilter(e.target.value)} className="max-w-44">
            <option value="">Má»i má»©c Bloom</option>
            {BLOOM_LEVELS.map((b) => <option key={b} value={b}>{b}</option>)}
          </Select>
          <Button className="ml-auto" onClick={() => setEdit({ type: 'mcq', options: ['', '', '', ''], correctAnswer: 'A', bloomLevel: BLOOM_LEVELS[0], explanation: '', category: '' })}>+ CÃ¢u há»i má»›i</Button>
        </div>

        {loading ? <Spinner /> : questions.length === 0 ? (
          <Card><EmptyState message="KhÃ´ng cÃ³ cÃ¢u há»i phÃ¹ há»£p. Táº¡o cÃ¢u há»i Ä‘áº§u tiÃªn!" /></Card>
        ) : (
          <div className="space-y-3">
            {questions.map((question, i) => (
              <Card key={question.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm leading-relaxed text-slate-200"><span className="mr-1 font-semibold text-slate-500">{i + 1}.</span>{question.content}</p>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => setEdit(question)} className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-800">Sá»­a</button>
                    <button onClick={() => void deleteQuestion(question.id)} className="rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-950/40">XÃ³a</button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone={question.type === 'mcq' ? 'indigo' : 'amber'}>{question.type === 'mcq' ? 'Tráº¯c nghiá»‡m' : 'Tá»± luáº­n'}</Badge>
                  {question.bloomLevel && <Badge>{question.bloomLevel}</Badge>}
                  {question.type === 'mcq' && question.correctAnswer && <Badge tone="green">ÄÃ¡p Ã¡n: {question.correctAnswer}</Badge>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <EditQuestionModal question={edit} folders={folders} onClose={() => setEdit(null)} onSaved={load} />
    </div>
  );
}

async function removeFolder(id: string, reload: () => Promise<void>) {
  if (!window.confirm('XÃ³a thÆ° má»¥c? CÃ¢u há»i trong thÆ° má»¥c sáº½ chuyá»ƒn ra ngoÃ i.')) return;
  try {
    await api(`/questions/folders/${id}`, { method: 'DELETE' });
    window.location.reload();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Lá»—i');
  }
  void reload;
}

function Badge({ tone = 'slate', children }: { tone?: 'green' | 'red' | 'amber' | 'indigo' | 'slate'; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    green: 'bg-emerald-950 text-emerald-400 ring-emerald-800',
    red: 'bg-red-950 text-red-400 ring-red-800',
    amber: 'bg-amber-950 text-amber-400 ring-amber-800',
    indigo: 'bg-indigo-950 text-indigo-300 ring-indigo-800',
    slate: 'bg-slate-800 text-slate-300 ring-slate-700',
  };
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}>{children}</span>;
}

function EditQuestionModal({ question, folders, onClose, onSaved }: { question: Partial<Question> | null; folders: { id: string; name: string }[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const isNew = !question?.id;
  const [form, setForm] = useState<Partial<Question>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(question ?? {});
  }, [question]);

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
      toast.success(isNew ? 'ÄÃ£ thÃªm cÃ¢u há»i' : 'ÄÃ£ cáº­p nháº­t');
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i lÆ°u');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'CÃ¢u há»i má»›i' : 'Sá»­a cÃ¢u há»i'} wide>
      <div className="space-y-3">
        <div>
          <Label>Ná»™i dung cÃ¢u há»i *</Label>
          <Textarea rows={3} value={form.content ?? ''} onChange={(e) => set('content', e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Loáº¡i</Label>
            <Select value={form.type} onChange={(e) => set('type', e.target.value as 'mcq' | 'essay')}>
              <option value="mcq">Tráº¯c nghiá»‡m</option><option value="essay">Tá»± luáº­n</option>
            </Select>
          </div>
          <div>
            <Label>Má»©c Bloom</Label>
            <Select value={form.bloomLevel ?? ''} onChange={(e) => set('bloomLevel', e.target.value)}>
              <option value="">â€”</option>{BLOOM_LEVELS.map((b) => <option key={b}>{b}</option>)}
            </Select>
          </div>
          <div>
            <Label>Chá»§ Ä‘á»</Label>
            <Input value={form.category ?? ''} onChange={(e) => set('category', e.target.value)} />
          </div>
        </div>
        {form.type === 'mcq' && (
          <div className="space-y-2">
            <Label>PhÆ°Æ¡ng Ã¡n (chá»n radio Ä‘Ã¡nh dáº¥u Ä‘Ã¡p Ã¡n Ä‘Ãºng)</Label>
            {(form.options ?? []).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct"
                  checked={(form.correctAnswer ?? '') === String.fromCharCode(65 + i)}
                  onChange={() => set('correctAnswer', String.fromCharCode(65 + i))}
                />
                <Input value={opt} onChange={(e) => { const opts = [...(form.options ?? [])]; opts[i] = e.target.value; set('options', opts); }} placeholder={`PhÆ°Æ¡ng Ã¡n ${String.fromCharCode(65 + i)}`} />
              </div>
            ))}
          </div>
        )}
        {form.type === 'essay' && (
          <div><Label>ÄÃ¡p Ã¡n / dÃ n Ã½ tham kháº£o</Label><Textarea rows={3} value={form.correctAnswer ?? ''} onChange={(e) => set('correctAnswer', e.target.value)} /></div>
        )}
        <div><Label>Lá»i giáº£i</Label><Textarea rows={2} value={form.explanation ?? ''} onChange={(e) => set('explanation', e.target.value)} /></div>
        <div>
          <Label>ThÆ° má»¥c</Label>
          <Select value={form.folderId ?? ''} onChange={(e) => set('folderId', e.target.value || null)}>
            <option value="">â€” KhÃ´ng thÆ° má»¥c â€”</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </Select>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={() => void save()} disabled={busy || !form.content}>LÆ°u cÃ¢u há»i</Button>
        </div>
      </div>
    </Modal>
  );
}

function AiTab({ onSaved }: { onSaved: () => void }) {
  const [sourceText, setSourceText] = useState('');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [generated, setGenerated] = useState<Question[]>([]);
  const [folderId, setFolderId] = useState('');
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    api<{ folders: { id: string; name: string }[] }>('/questions/folders').then((r) => setFolders(r.folders)).catch(() => undefined);
  }, []);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setSourceText(String(reader.result ?? '').slice(0, 500_000));
    reader.readAsText(file);
  }

  async function generate() {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) { toast.error('HÃ£y chá»n sá»‘ cÃ¢u cho Ã­t nháº¥t má»™t má»©c Bloom'); return; }
    setBusy(true);
    setGenerated([]);
    try {
      setProgress('AI Ä‘ang phÃ¢n tÃ­ch tÃ i liá»‡u vÃ  soáº¡n cÃ¢u há»i theo ma tráº­n Bloomâ€¦');
      const res = await api<{ questions: Question[]; requestedCount: number }>('/ai/generate-questions', {
        method: 'POST',
        body: JSON.stringify({ sourceText, counts }),
      });
      setGenerated(res.questions);
      setProgress(`ÄÃ£ nháº­n ${res.questions.length}/${res.requestedCount} cÃ¢u tá»« AI. Kiá»ƒm tra vÃ  phÃª duyá»‡t bÃªn dÆ°á»›i.`);
      toast.success(`AI tráº£ vá» ${res.questions.length} cÃ¢u`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i gá»i AI');
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  async function approveAll() {
    if (generated.length === 0) return;
    setBusy(true);
    try {
      for (const question of generated) {
        await api('/questions', { method: 'POST', body: JSON.stringify({ ...question, folderId: folderId || null }) });
      }
      toast.success(`ÄÃ£ lÆ°u ${generated.length} cÃ¢u vÃ o ngÃ¢n hÃ ng`);
      setGenerated([]);
      setProgress('');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i lÆ°u hÃ ng loáº¡t');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-3 font-medium text-slate-200">1. Nguá»“n tÃ i liá»‡u</h3>
        <input type="file" accept=".txt,.md" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} className="mb-3 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200" />
        <Textarea rows={10} placeholder="DÃ¡n vÄƒn báº£n giÃ¡o trÃ¬nh/bÃ i giáº£ng táº¡i Ä‘Ã¢y (tá»‘i thiá»ƒu 200 kÃ½ tá»±)â€¦" value={sourceText} onChange={(e) => setSourceText(e.target.value)} />
        <h3 className="mb-2 mt-5 font-medium text-slate-200">2. Ma tráº­n Bloom â€” sá»‘ cÃ¢u má»—i má»©c</h3>
        <div className="grid grid-cols-4 gap-2">
          {BLOOM_LEVELS.map((b) => (
            <div key={b}>
              <Label>{b}</Label>
              <Input type="number" min={0} max={20} value={counts[b] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [b]: Math.min(20, Number(e.target.value)) }))} className="text-center" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex-1"><Label>LÆ°u vÃ o thÆ° má»¥c</Label>
            <Select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">â€” KhÃ´ng â€”</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>
          <Button className="mt-5" onClick={() => void generate()} disabled={busy || sourceText.length < 200}>
            {busy ? 'Äang sinhâ€¦' : 'Sinh cÃ¢u há»i'}
          </Button>
        </div>
        {progress && <p className="mt-3 rounded-lg bg-indigo-950/50 px-3 py-2 text-sm text-indigo-300">{progress}</p>}
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium text-slate-200">3. Kiá»ƒm duyá»‡t ({generated.length})</h3>
          {generated.length > 0 && <Button onClick={() => void approveAll()} disabled={busy}>âœ“ PhÃª duyá»‡t táº¥t cáº£</Button>}
        </div>
        {generated.length === 0 ? (
          <EmptyState message="CÃ¢u há»i AI sáº½ hiá»‡n á»Ÿ Ä‘Ã¢y Ä‘á»ƒ báº¡n xem/sá»­a trÆ°á»›c khi lÆ°u" />
        ) : (
          <ul className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
            {generated.map((question, i) => (
              <li key={i} className="rounded-xl p-3 ring-1 ring-slate-800">
                <p className="text-sm text-slate-200">{i + 1}. {question.content}</p>
                {question.options.length > 0 && (
                  <ol className="mt-1 space-y-0.5 text-xs text-slate-400">
                    {question.options.map((o, oi) => (
                      <li key={oi} className={String.fromCharCode(65 + oi) === question.correctAnswer ? 'font-semibold text-emerald-400' : ''}>
                        {String.fromCharCode(65 + oi)}. {o}
                      </li>
                    ))}
                  </ol>
                )}
                <div className="mt-1.5 flex gap-1.5">
                  <Badge tone="indigo">{question.bloomLevel}</Badge>
                  {question.explanation && <span className="text-xs italic text-slate-500">{question.explanation.slice(0, 100)}</span>}
                </div>
                <button onClick={() => setGenerated((g) => g.filter((_, gi) => gi !== i))} className="mt-2 text-xs text-red-400 hover:text-red-300">Loáº¡i bá»</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ImportTab({ onImported }: { onImported: () => void }) {
  const [text, setText] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? '').slice(0, 2_000_000));
    reader.readAsText(file);
  }

  async function submit() {
    setBusy(true);
    try {
      const res = await api<{ imported: number; warnings: string[] }>('/questions/import-text', { method: 'POST', body: JSON.stringify({ text }) });
      toast.success(`ÄÃ£ import ${res.imported} cÃ¢u há»i`);
      setWarnings(res.warnings);
      if (res.imported > 0) onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i import');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <p className="mb-3 text-sm text-slate-400">
        Äá»‹nh dáº¡ng há»— trá»£: <code className="rounded bg-slate-800 px-1">CÃ¢u 1:</code> â€¦ phÆ°Æ¡ng Ã¡n <code className="rounded bg-slate-800 px-1">A.</code> <code className="rounded bg-slate-800 px-1">B.</code>â€¦,
        Ä‘Ã¡p Ã¡n Ä‘Ã¡nh dáº¥u sao <code className="rounded bg-slate-800 px-1">*A.</code> trong pháº§n "ÄÃ¡p Ã¡n", hoáº·c báº£ng Ä‘Ã¡p Ã¡n cuá»‘i Ä‘á» dáº¡ng <code className="rounded bg-slate-800 px-1">1A 2B 3C</code>.
        Pháº§n tá»± luáº­n báº¯t Ä‘áº§u báº±ng dÃ²ng "PHáº¦N II".
      </p>
      <input type="file" accept=".txt,.md" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} className="mb-3 block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200" />
      <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder={'CÃ¢u 1: Ná»™i dung cÃ¢u há»iâ€¦\nA. phÆ°Æ¡ng Ã¡n A\nB. phÆ°Æ¡ng Ã¡n B\nâ€¦\nÄÃ¡p Ã¡n: *A. giáº£i thÃ­châ€¦'} />
      <div className="mt-3 flex items-center justify-between">
        {warnings.length > 0 && (
          <details className="text-xs text-amber-400">
            <summary className="cursor-pointer">{warnings.length} cáº£nh bÃ¡o</summary>
            <ul className="mt-1 list-disc pl-4">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </details>
        )}
        <Button className="ml-auto" onClick={() => void submit()} disabled={busy || text.length < 10}>Import</Button>
      </div>
    </Card>
  );
}
