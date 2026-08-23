import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, PageHeader, Spinner, Badge, Modal, Label, Textarea } from '../components/ui';
import toast from '../stores/toastStore';

interface ResultRow {
  resultId: string;
  studentId: string;
  studentName: string;
  username: string;
  status: string;
  score: number | null;
  redFlags: number;
  answeredCount: number;
  totalCount: number;
  pendingEssays: number;
  perQuestion: Record<string, { s: string | null; c: string | null; k: boolean | 'pending'; essayScore?: number }>;
  answers: Record<string, string>;
}

interface Stats {
  submittedCount: number;
  avgScore: number;
  buckets: { range: string; count: number }[];
  wrongAnalysis: { id: string; content: string; wrong: number; total: number }[];
}

interface EssayQ {
  id: string;
  content: string;
  reference: string;
}

export default function ExamResultsPage() {
  const { examId } = useParams<{ examId: string }>();
  const [results, setResults] = useState<ResultRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [essayQuestions, setEssayQuestions] = useState<EssayQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState<ResultRow | null>(null);
  const [aiBusyFor, setAiBusyFor] = useState<string | null>(null);
  const liveRef = useRef(true);

  const load = useCallback(async () => {
    if (!examId) return;
    try {
      const res = await api<{ results: ResultRow[]; essayQuestions: EssayQ[] }>(`/exams/${examId}/results`);
      setResults(res.results);
      setEssayQuestions(res.essayQuestions ?? []);
      const s = await api<Stats>(`/exams/${examId}/stats`);
      setStats(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i táº£i káº¿t quáº£');
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (liveRef.current) void load();
    }, 7000);
    return () => clearInterval(timer);
  }, [load]);

  async function aiComment(row: ResultRow) {
    setAiBusyFor(row.resultId);
    try {
      const wrong = Object.entries(row.perQuestion)
        .filter(([, p]) => p.k === false)
        .map(([qid, p]) => row.answers[qid] ?? `(${p.s ?? 'bá» trá»‘ng'})`);
      const res = await api<{ comment: string }>('/ai/comment-student', {
        method: 'POST',
        body: JSON.stringify({ studentName: row.studentName, score: row.score, redFlags: row.redFlags, wrongQuestions: wrong.slice(0, 5) }),
      });
      toast.success(`Nháº­n xÃ©t AI cho ${row.studentName}: ${res.comment}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i AI');
    } finally {
      setAiBusyFor(null);
    }
  }

  if (loading) return <Spinner />;

  const maxBucket = Math.max(1, ...(stats?.buckets.map((b) => b.count) ?? [1]));
  const submitted = results.filter((r) => r.status === 'submitted');

  return (
    <div>
      <PageHeader
        title="Káº¿t quáº£ thi"
        subtitle={`${submitted.length} bÃ i Ä‘Ã£ ná»™p Â· tá»± cáº­p nháº­t má»—i 7 giÃ¢y`}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Há»c viÃªn</th>
                  <th className="px-4 py-3">Tráº¡ng thÃ¡i</th>
                  <th className="px-4 py-3">Äiá»ƒm</th>
                  <th className="px-4 py-3">TL chá»</th>
                  <th className="px-4 py-3">âš </th>
                  <th className="px-4 py-3 text-right">Thao tÃ¡c</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {results.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">ChÆ°a cÃ³ ai lÃ m bÃ i</td></tr>
                )}
                {results.map((r) => (
                  <tr key={r.resultId} className="hover:bg-slate-800/40">
                    <td className="px-4 py-2.5">{r.studentName}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={r.status === 'submitted' ? 'green' : r.status === 'in_progress' ? 'amber' : 'slate'}>
                        {r.status === 'submitted' ? 'ÄÃ£ ná»™p' : r.status === 'in_progress' ? 'Äang thi' : 'Máº¥t káº¿t ná»‘i'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-semibold">{r.score !== null ? r.score.toFixed(2) : 'â€”'}</td>
                    <td className="px-4 py-2.5">{r.pendingEssays > 0 ? <span className="text-amber-400">{r.pendingEssays} cÃ¢u</span> : 'â€”'}</td>
                    <td className="px-4 py-2.5">{r.redFlags > 0 ? <span className="text-red-400">{r.redFlags}</span> : '0'}</td>
                    <td className="px-4 py-2.5 text-right">
                      {r.pendingEssays > 0 && (
                        <button onClick={() => setGrading(r)} className="mr-1 rounded-md px-2 py-1 text-xs text-indigo-300 hover:bg-slate-800">Cháº¥m TL</button>
                      )}
                      <button onClick={() => void aiComment(r)} disabled={aiBusyFor === r.resultId} className="rounded-md px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
                        ðŸ¤– Nháº­n xÃ©t AI
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          {stats && (
            <>
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-300">Phá»• Ä‘iá»ƒm ({stats.submittedCount} bÃ i)</h3>
                <div className="mb-1 text-3xl font-bold text-indigo-300">{stats.avgScore.toFixed(2)}</div>
                <p className="mb-3 text-xs text-slate-500">Ä‘iá»ƒm trung bÃ¬nh</p>
                <div className="flex items-end gap-1" style={{ height: 90 }}>
                  {stats.buckets.map((b) => (
                    <div key={b.range} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[10px] text-slate-500">{b.count || ''}</span>
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-indigo-700 to-indigo-500"
                        style={{ height: `${(b.count / maxBucket) * 100}%`, minHeight: b.count > 0 ? 3 : 0 }}
                      />
                      <span className="text-[9px] text-slate-600">{b.range.split('-')[0]}</span>
                    </div>
                  ))}
                </div>
              </Card>
              {stats.wrongAnalysis.length > 0 && (
                <Card className="max-h-80 overflow-y-auto p-4">
                  <h3 className="mb-2 text-sm font-semibold text-slate-300">CÃ¢u bá»‹ sai nhiá»u nháº¥t</h3>
                  <ul className="space-y-2 text-xs">
                    {stats.wrongAnalysis.filter((w) => w.wrong > 0).slice(0, 10).map((w) => (
                      <li key={w.id} className="rounded-lg px-2.5 py-2 ring-1 ring-slate-800">
                        <p className="line-clamp-2 text-slate-300">{w.content}</p>
                        <p className="mt-1 text-red-400">{w.wrong}/{w.total} há»c viÃªn sai</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {grading && <EssayGraderModal row={grading} essayQuestions={essayQuestions} onClose={() => setGrading(null)} onSaved={() => void load()} />}
    </div>
  );
}

function EssayGraderModal({ row, essayQuestions, onClose, onSaved }: { row: ResultRow; essayQuestions: EssayQ[]; onClose: () => void; onSaved: () => void | Promise<void>; }) {
  const essayEntries = Object.entries(row.perQuestion).filter(([, p]) => p.k === 'pending');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function gradeOneAI(qid: string) {
    const eq = essayQuestions.find((e) => e.id === qid);
    if (!eq) { toast.error('KhÃ´ng tÃ¬m tháº¥y ná»™i dung cÃ¢u há»i'); return; }
    setBusyId(qid);
    try {
      const res = await api<{ score: number; feedback: string }>('/ai/grade-essay', {
        method: 'POST',
        body: JSON.stringify({
          questionContent: eq.content,
          studentAnswer: row.answers[qid] ?? '',
          referenceAnswer: eq.reference,
        }),
      });
      setScores((s) => ({ ...s, [qid]: res.score }));
      toast.info(`AI cháº¥m ${res.score}/10 â€” ${res.feedback}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i AI');
    } finally {
      setBusyId(null);
    }
  }

  async function submit() {
    if (Object.keys(scores).length === 0) { toast.error('ChÆ°a nháº­p Ä‘iá»ƒm nÃ o'); return; }
    setSaving(true);
    try {
      await api(`/results/${row.resultId}/essay-scores`, { method: 'PUT', body: JSON.stringify({ scores }) });
      toast.success('ÄÃ£ lÆ°u Ä‘iá»ƒm tá»± luáº­n');
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Cháº¥m tá»± luáº­n â€” ${row.studentName}`} wide>
      <div className="space-y-4">
        {essayEntries.length === 0 && <p className="py-6 text-center text-sm text-slate-500">KhÃ´ng cÃ³ cÃ¢u tá»± luáº­n chá» cháº¥m</p>}
        {essayEntries.map(([qid]) => {
          const eq = essayQuestions.find((e) => e.id === qid);
          return (
            <div key={qid} className="rounded-xl p-3 ring-1 ring-slate-800">
              {eq && (
                <details className="mb-2 text-xs text-slate-400">
                  <summary className="cursor-pointer">CÃ¢u há»i &amp; Ä‘Ã¡p Ã¡n tham kháº£o</summary>
                  <p className="mt-1">{eq.content}</p>
                  {eq.reference && <p className="mt-1 text-emerald-400">ÄÃ¡p Ã¡n: {eq.reference.slice(0, 500)}</p>}
                </details>
              )}
              <Textarea rows={4} readOnly value={row.answers[qid] ?? '(Há»c viÃªn bá» trá»‘ng)'} className="!bg-slate-950/60" />
              <div className="mt-2 flex items-center gap-2">
                <Label>Äiá»ƒm (0-10):&nbsp;</Label>
                <input type="number" min={0} max={10} step={0.25}
                  value={scores[qid] ?? ''}
                  onChange={(e) => setScores((s) => ({ ...s, [qid]: Number(e.target.value) }))}
                  className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
                />
                <Button variant="secondary" onClick={() => void gradeOneAI(qid)} disabled={busyId === qid}>ðŸ¤– AI gá»£i Ã½ Ä‘iá»ƒm</Button>
              </div>
            </div>
          );
        })}
        <div className="flex justify-end"><Button onClick={() => void submit()} disabled={saving || Object.keys(scores).length === 0}>LÆ°u Ä‘iá»ƒm</Button></div>
      </div>
    </Modal>
  );
}
