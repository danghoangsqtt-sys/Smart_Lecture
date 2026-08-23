import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Spinner } from '../components/ui';
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
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Lá»—i'))
      .finally(() => setLoading(false));
  }, [purpose]);

  return (
    <div>
      <PageHeader
        title={purpose === 'homework' ? 'Tá»± Ã´n táº­p' : 'BÃ i thi cá»§a tÃ´i'}
        subtitle={purpose === 'homework' ? 'LÃ m láº¡i khÃ´ng giá»›i háº¡n sá»‘ lÆ°á»£t' : 'CÃ¡c bÃ i kiá»ƒm tra giÃ¡o viÃªn giao cho lá»›p báº¡n'}
        actions={
          <div className="flex gap-1 rounded-xl bg-slate-900 p-1 ring-1 ring-slate-800">
            {([['online_test', 'Kiá»ƒm tra'], ['homework', 'Tá»± Ã´n']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setPurpose(k)} className={`rounded-lg px-3 py-1.5 text-sm ${purpose === k ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>{l}</button>
            ))}
          </div>
        }
      />
      {loading ? <Spinner /> : exams.length === 0 ? (
        <Card><EmptyState message="Hiá»‡n chÆ°a cÃ³ bÃ i thi nÃ o Ä‘Æ°á»£c giao" /></Card>
      ) : (
        <div className="space-y-3">
          {exams.map((e) => {
            const exhausted = e.attemptsUsed >= e.config.maxAttempts && !e.resumableAttemptId;
            return (
              <Card key={e.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">{e.title}</h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {e.questionCount} cÃ¢u Â· {e.durationMin} phÃºt Â· Ä‘Ã£ lÃ m {e.attemptsUsed}/{e.config.maxAttempts} lÆ°á»£t
                    {e.config.hasPassword && ' Â· ðŸ”’ cáº§n máº­t kháº©u'}
                    {e.config.startAt && ` Â· má»Ÿ ${new Date(e.config.startAt).toLocaleString('vi-VN')}`}
                    {e.config.endAt && ` â†’ Ä‘Ã³ng ${new Date(e.config.endAt).toLocaleString('vi-VN')}`}
                  </p>
                </div>
                {exhausted ? (
                  <Badge>Háº¿t lÆ°á»£t</Badge>
                ) : (
                  <Link to={`/my-exams/${e.id}`} state={{ resume: e.resumableAttemptId }}>
                    <Button>{e.resumableAttemptId ? 'Tiáº¿p tá»¥c bÃ i dá»Ÿ' : purpose === 'homework' ? 'Ã”n ngay' : 'VÃ o thi'}</Button>
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
        if (resume) toast.info('ÄÃ£ khÃ´i phá»¥c bÃ i lÃ m cá»§a báº¡n');
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'KhÃ´ng vÃ o Ä‘Æ°á»£c bÃ i thi';
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
        /* offline â€” sáº½ autosave chu ká»³ sau */
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
      if (unanswered > 0 && !window.confirm(`Báº¡n cÃ²n ${unanswered} cÃ¢u chÆ°a tráº£ lá»i. Ná»™p bÃ i?`)) return;
    }
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await api<{ score: number | null; provisionalScore: number; fullyGraded: boolean }>(`/attempts/${data.attempt.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });
      toast.success(res.fullyGraded ? `Ná»™p thÃ nh cÃ´ng! Äiá»ƒm: ${res.provisionalScore}/10` : 'Ná»™p thÃ nh cÃ´ng! Chá» giÃ¡o viÃªn cháº¥m tá»± luáº­n.');
      void navigate('/my-results');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lá»—i ná»™p bÃ i');
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
      <div className="sticky top-0 z-10 mb-4 flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 ring-1 ring-slate-800">
        <h1 className="truncate font-semibold">{data.attempt.examTitle}</h1>
        <span className={`rounded-lg px-3 py-1 font-mono text-lg font-bold ${remaining < 120 ? 'animate-pulse bg-red-950 text-red-400' : 'bg-slate-800 text-emerald-400'}`}>
          {mm}:{ss}
        </span>
      </div>

      <Card className="p-6">
        <p className="mb-1 text-xs text-slate-500">CÃ¢u {currentIdx + 1}/{data.questions.length}</p>
        <p className="whitespace-pre-wrap leading-relaxed text-slate-100">{q?.content}</p>

        {q?.type === 'mcq' && (
          <div className="mt-5 space-y-2">
            {(q.options ?? []).map((opt, i) => {
              const letter = String.fromCharCode(65 + i);
              const active = answers[q.id] === letter;
              return (
                <button
                  key={i}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: letter }))}
                  className={`flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left text-sm transition ${
                    active ? 'bg-indigo-600/25 text-indigo-100 ring-2 ring-indigo-500' : 'bg-slate-800/60 hover:bg-slate-800'
                  }`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-indigo-500 text-white' : 'bg-slate-700'}`}>{letter}</span>
                  <span className="whitespace-pre-wrap">{opt.replace(/^([A-D])[\.\:\)]\s+/, '')}</span>
                </button>
              );
            })}
          </div>
        )}
        {q?.type === 'essay' && (
          <textarea
            rows={8}
            value={answers[q.id] ?? ''}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
            placeholder="Nháº­p cÃ¢u tráº£ lá»i tá»± luáº­nâ€¦"
            className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm"
          />
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={() => setFlags((f) => { const n = new Set(f); if (n.has(q?.id ?? '')) n.delete(q?.id ?? ''); else n.add(q?.id ?? ''); return n; })} className="text-xs text-amber-400">
            {flags.has(q?.id ?? '') ? 'â˜… Bá» Ä‘Ã¡nh dáº¥u' : 'â˜† ÄÃ¡nh dáº¥u xem láº¡i'}
          </button>
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" disabled={currentIdx === 0} onClick={() => setCurrentIdx((i) => i - 1)}>â† TrÆ°á»›c</Button>
        <div className="flex flex-wrap justify-center gap-1">
          {data.questions.map((qq, i) => (
            <button
              key={qq.id}
              onClick={() => setCurrentIdx(i)}
              className={`h-7 w-7 rounded-md text-xs font-medium ${
                i === currentIdx ? 'ring-2 ring-indigo-400' : ''
              } ${answers[qq.id] ? 'bg-indigo-600 text-white' : flags.has(qq.id) ? 'bg-amber-800 text-amber-200' : 'bg-slate-800 text-slate-400'}`}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {currentIdx < data.questions.length - 1 ? (
          <Button onClick={() => setCurrentIdx((i) => i + 1)}>Sau â†’</Button>
        ) : (
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>Ná»™p bÃ i</Button>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="XÃ¡c nháº­n ná»™p bÃ i">
        <p className="text-sm text-slate-300">ÄÃ£ tráº£ lá»i: {Object.keys(answers).length}/{data.questions.length} cÃ¢u. Ná»™p bÃ i ngay?</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Xem láº¡i</Button>
          <Button variant="danger" onClick={() => void doSubmit(false)} disabled={submitting}>Ná»™p bÃ i</Button>
        </div>
      </Modal>
    </div>
  );
}
