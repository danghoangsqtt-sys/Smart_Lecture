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
  notSubmittedCount?: number;
  classSize?: number;
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
      toast.error(e instanceof Error ? e.message : 'Lỗi tải kết quả');
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
        .flatMap(([qid, p]) => p.k === false ? [row.answers[qid] ?? `(${p.s ?? 'bỏ trống'})`] : []);
      const res = await api<{ comment: string }>('/ai/comment-student', {
        method: 'POST',
        body: JSON.stringify({ studentName: row.studentName, score: row.score, redFlags: row.redFlags, wrongQuestions: wrong.slice(0, 5) }),
      });
      toast.success(`Nhận xét AI cho ${row.studentName}: ${res.comment}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi AI');
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
        title="Kết quả thi"
        subtitle={`${submitted.length} bài đã nộp · tự cập nhật mỗi 7 giây`}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Học viên</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Điểm</th>
                  <th className="px-4 py-3">TL chờ</th>
                  <th className="px-4 py-3"><i className="fas fa-triangle-exclamation" /></th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {results.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Chưa có ai làm bài</td></tr>
                )}
                {results.map((r) => (
                  <tr key={r.resultId} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">{r.studentName}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={r.status === 'submitted' ? 'green' : r.status === 'in_progress' ? 'amber' : 'slate'}>
                        {r.status === 'submitted' ? 'Đã nộp' : r.status === 'in_progress' ? 'Đang thi' : 'Mất kết nối'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 font-semibold">{r.score !== null ? r.score.toFixed(2) : '—'}</td>
                    <td className="px-4 py-2.5">{r.pendingEssays > 0 ? <span className="text-amber-700">{r.pendingEssays} câu</span> : '—'}</td>
                    <td className="px-4 py-2.5">{r.redFlags > 0 ? <span className="text-red-600">{r.redFlags}</span> : '0'}</td>
                    <td className="px-4 py-2.5 text-right">
                      {r.pendingEssays > 0 && (
                        <button onClick={() => setGrading(r)} className="mr-1 rounded-sm px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-slate-100">Chấm TL</button>
                      )}
                      <button onClick={() => void aiComment(r)} disabled={aiBusyFor === r.resultId} className="rounded-sm px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                        <i className="fas fa-robot" /> Nhận xét AI
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
                <h3 className="mb-2 text-sm font-bold text-slate-700">Phổ điểm ({stats.submittedCount} bài)</h3>
                <div className="mb-1 text-3xl font-bold text-blue-900">{stats.avgScore.toFixed(2)}</div>
                <p className="mb-3 text-xs text-slate-500">điểm trung bình</p>
                <div className="flex items-end gap-1" style={{ height: 90 }}>
                  {stats.buckets.map((b) => (
                    <div key={b.range} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[10px] text-slate-500">{b.count || ''}</span>
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-blue-900 to-blue-600"
                        style={{ height: `${(b.count / maxBucket) * 100}%`, minHeight: b.count > 0 ? 3 : 0 }}
                      />
                      <span className="text-[9px] text-slate-600">{b.range.split('-')[0]}</span>
                    </div>
                  ))}
                </div>
              </Card>
              {stats.wrongAnalysis.length > 0 && (
                <Card className="max-h-80 overflow-y-auto p-4">
                  <h3 className="mb-2 text-sm font-bold text-slate-700">Câu bị sai nhiều nhất</h3>
                  <ul className="space-y-2 text-xs">
                    {stats.wrongAnalysis.filter((w) => w.wrong > 0).slice(0, 10).map((w) => (
                      <li key={w.id} className="rounded-sm border border-slate-200 px-2.5 py-2">
                        <p className="line-clamp-2 text-slate-700">{w.content}</p>
                        <p className="mt-1 text-red-600">{w.wrong}/{w.total} học viên sai</p>
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
    if (!eq) { toast.error('Không tìm thấy nội dung câu hỏi'); return; }
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
      toast.info(`AI chấm ${res.score}/10 — ${res.feedback}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi AI');
    } finally {
      setBusyId(null);
    }
  }

  async function submit() {
    if (Object.keys(scores).length === 0) { toast.error('Chưa nhập điểm nào'); return; }
    setSaving(true);
    try {
      await api(`/results/${row.resultId}/essay-scores`, { method: 'PUT', body: JSON.stringify({ scores }) });
      toast.success('Đã lưu điểm tự luận');
      onClose();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Chấm tự luận — ${row.studentName}`} wide>
      <div className="space-y-4">
        {essayEntries.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Không có câu tự luận chờ chấm</p>}
        {essayEntries.map(([qid]) => {
          const eq = essayQuestions.find((e) => e.id === qid);
          return (
            <div key={qid} className="rounded-sm border border-slate-200 p-3">
              {eq && (
                <details className="mb-2 text-xs text-slate-500">
                  <summary className="cursor-pointer">Câu hỏi &amp; đáp án tham khảo</summary>
                  <p className="mt-1">{eq.content}</p>
                  {eq.reference && <p className="mt-1 text-emerald-700">Đáp án: {eq.reference.slice(0, 500)}</p>}
                </details>
              )}
              <Textarea rows={4} readOnly value={row.answers[qid] ?? '(Học viên bỏ trống)'} className="!bg-slate-50" />
              <div className="mt-2 flex items-center gap-2">
                <Label>Điểm (0-10):&nbsp;</Label>
                <input type="number" min={0} max={10} step={0.25}
                  aria-label={`Điểm tự luận cho câu ${qid}`}
                  value={scores[qid] ?? ''}
                  onChange={(e) => setScores((s) => ({ ...s, [qid]: Number(e.target.value) }))}
                  className="w-20 rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                />
                <Button variant="secondary" onClick={() => void gradeOneAI(qid)} disabled={busyId === qid}><i className="fas fa-robot" /> AI gợi ý điểm</Button>
              </div>
            </div>
          );
        })}
        <div className="flex justify-end"><Button onClick={() => void submit()} disabled={saving || Object.keys(scores).length === 0}>Lưu điểm</Button></div>
      </div>
    </Modal>
  );
}
