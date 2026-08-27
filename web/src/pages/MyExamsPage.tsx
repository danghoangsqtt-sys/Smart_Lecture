import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Spinner, Textarea } from '../components/ui';
import toast from '../stores/toastStore';

interface AvailableExam {
  id: string;
  title: string;
  durationMin: number;
  questionCount: number;
  config: { startAt: string | null; endAt: string | null; hasPassword: boolean; maxAttempts: number };
  attemptsUsed: number;
  resumableAttemptId: string | null;
}

export default function MyExamsPage() {
  const [exams, setExams] = useState<AvailableExam[]>([]);
  const [purpose, setPurpose] = useState<'online_test' | 'homework'>('online_test');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<{ exams: AvailableExam[] }>(`/exams/available?purpose=${purpose}`)
      .then((r) => setExams(r.exams))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Lỗi'))
      .finally(() => setLoading(false));
  }, [purpose]);

  return (
    <div>
      <PageHeader
        title={purpose === 'homework' ? 'Tự ôn tập' : 'Bài thi của tôi'}
        subtitle={purpose === 'homework' ? 'Làm lại không giới hạn số lượt' : 'Các bài kiểm tra giáo viên giao cho lớp bạn'}
        actions={
          <div className="flex gap-1 rounded-sm border border-slate-200 bg-slate-100 p-1">
            {([['online_test', 'Kiểm tra'], ['homework', 'Tự ôn']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setPurpose(k)} className={`rounded-sm px-3 py-1.5 text-sm font-medium transition ${purpose === k ? 'bg-blue-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>{l}</button>
            ))}
          </div>
        }
      />
      {loading ? <Spinner /> : exams.length === 0 ? (
        <Card><EmptyState message="Hiện chưa có bài thi nào được giao" /></Card>
      ) : (
        <div className="space-y-3">
          {exams.map((e) => {
            const exhausted = e.attemptsUsed >= e.config.maxAttempts && !e.resumableAttemptId;
            return (
              <Card key={e.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-slate-800">{e.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {e.questionCount} câu · {e.durationMin} phút · đã làm {e.attemptsUsed}/{e.config.maxAttempts} lượt
                    {e.config.hasPassword && (
                      <>
                        {' · '}<i className="fas fa-lock" /> cần mật khẩu
                      </>
                    )}
                    {e.config.startAt && ` · mở ${new Date(e.config.startAt).toLocaleString('vi-VN')}`}
                    {e.config.endAt && ` → đóng ${new Date(e.config.endAt).toLocaleString('vi-VN')}`}
                  </p>
                </div>
                {exhausted ? (
                  <Badge>Hết lượt</Badge>
                ) : (
                  <Link to={`/my-exams/${e.id}`} state={{ resume: e.resumableAttemptId }}>
                    <Button>{e.resumableAttemptId ? 'Tiếp tục bài dở' : purpose === 'homework' ? 'Ôn ngay' : 'Vào thi'}</Button>
                  </Link>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface PaperQuestion {
  id: string;
  type: string;
  content: string;
  options?: string[];
}

interface AttemptResponse {
  attempt: { id: string; status: string; remainingSec: number; examTitle: string; durationMin: number; answers: Record<string, string> };
  questions: PaperQuestion[];
}

export function ExamRoomPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<AttemptResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const deadlineRef = useRef(0);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!examId) return;
    const resume = (new URLSearchParams(window.location.hash.split('?')[1] ?? '')).get('resume') === '1';
    api<AttemptResponse>(`/exams/${examId}/attempts`, { method: 'POST', body: JSON.stringify({}) })
      .then((r) => {
        setData(r);
        setAnswers(r.attempt.answers);
        deadlineRef.current = Date.now() + r.attempt.remainingSec * 1000;
        setRemaining(r.attempt.remainingSec);
        if (resume) toast.info('Đã khôi phục bài làm của bạn');
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Không vào được bài thi';
        toast.error(msg);
        void navigate('/my-exams');
      });
    void resume;
  }, [examId, navigate]);

  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => {
      const sec = Math.max(0, Math.floor((deadlineRef.current - Date.now()) / 1000));
      setRemaining(sec);
      if (sec <= 0 && !submittedRef.current) void doSubmit(true);
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const saveAnswers = useCallback(
    async (ans: Record<string, string>) => {
      if (!data || submittedRef.current) return;
      try {
        await api(`/attempts/${data.attempt.id}/answers`, { method: 'PUT', body: JSON.stringify({ answers: ans }) });
      } catch {
        /* offline — sẽ autosave chu kỳ sau */
      }
    },
    [data]
  );

  useEffect(() => {
    if (!data) return;
    const t = setInterval(() => void saveAnswers(answers), 5000);
    return () => clearInterval(t);
  }, [answers, data, saveAnswers]);

  useEffect(() => {
    function onVis() {
      if (document.hidden && data && !submittedRef.current) {
        void api(`/attempts/${data.attempt.id}/redflag`, { method: 'POST' }).catch(() => undefined);
      }
    }
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [data]);

  async function doSubmit(auto = false) {
    if (!data || submittedRef.current) return;
    if (!auto) {
      const unanswered = data.questions.filter((q) => !answers[q.id]).length;
      if (unanswered > 0 && !window.confirm(`Bạn còn ${unanswered} câu chưa trả lời. Nộp bài?`)) return;
    }
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await api<{ score: number | null; provisionalScore: number; fullyGraded: boolean }>(`/attempts/${data.attempt.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });
      toast.success(res.fullyGraded ? `Nộp thành công! Điểm: ${res.provisionalScore}/10` : 'Nộp thành công! Chờ giáo viên chấm tự luận.');
      void navigate('/my-results');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi nộp bài');
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) return <Spinner />;
  const q = data.questions[currentIdx];
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-0 z-10 mb-4 flex items-center justify-between rounded-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <h1 className="truncate font-semibold text-slate-800">{data.attempt.examTitle}</h1>
        <span className={`rounded-sm px-3 py-1 font-mono text-lg font-bold ${remaining < 120 ? 'animate-pulse bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {mm}:{ss}
        </span>
      </div>

      <Card className="p-6">
        <p className="mb-1 text-xs text-slate-500">Câu {currentIdx + 1}/{data.questions.length}</p>
        <p className="whitespace-pre-wrap leading-relaxed text-slate-800">{q?.content}</p>

        {q?.type === 'mcq' && (
          <div className="mt-5 space-y-2">
            {(q.options ?? []).map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              const active = answers[q.id] === letter;
              return (
                <button
                  key={letter}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: letter }))}
                  className={`flex w-full items-start gap-3 rounded-sm border px-4 py-3 text-left text-sm transition ${
                    active ? 'border-blue-900 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-blue-900 text-white' : 'bg-slate-200 text-slate-700'}`}>{letter}</span>
                  <span className="whitespace-pre-wrap">{opt.replace(/^([A-D])[\.\:\)]\s+/, '')}</span>
                </button>
              );
            })}
          </div>
        )}
        {q?.type === 'essay' && (
          <Textarea
            rows={8}
            value={answers[q.id] ?? ''}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            placeholder="Nhập câu trả lời tự luận…"
            className="mt-4"
          />
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={() => setFlags((f) => { const n = new Set(f); if (n.has(q?.id ?? '')) n.delete(q?.id ?? ''); else n.add(q?.id ?? ''); return n; })} className="text-xs font-semibold text-amber-700 hover:text-amber-800">
            {flags.has(q?.id ?? '') ? (
              <><i className="fas fa-star mr-1" />Bỏ đánh dấu</>
            ) : (
              <><i className="far fa-star mr-1" />Đánh dấu xem lại</>
            )}
          </button>
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" disabled={currentIdx === 0} onClick={() => setCurrentIdx((i) => i - 1)}>← Trước</Button>
        <div className="flex flex-wrap justify-center gap-1">
          {data.questions.map((qq, i) => (
            <button
              key={qq.id}
              onClick={() => setCurrentIdx(i)}
              className={`h-7 w-7 rounded-sm text-xs font-medium transition ${
                i === currentIdx ? 'ring-2 ring-blue-900' : ''
              } ${answers[qq.id] ? 'bg-blue-900 text-white' : flags.has(qq.id) ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {currentIdx < data.questions.length - 1 ? (
          <Button onClick={() => setCurrentIdx((i) => i + 1)}>Sau →</Button>
        ) : (
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>Nộp bài</Button>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Xác nhận nộp bài">
        <p className="text-sm text-slate-600">Đã trả lời: {Object.keys(answers).length}/{data.questions.length} câu. Nộp bài ngay?</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Xem lại</Button>
          <Button variant="danger" onClick={() => void doSubmit(false)} disabled={submitting}>Nộp bài</Button>
        </div>
      </Modal>
    </div>
  );
}
