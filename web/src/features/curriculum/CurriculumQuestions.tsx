import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, EmptyState, Label, Select } from '../../components/ui';
import { sharedCurriculum, type BankQuestion } from '../../lib/sharedCurriculum';
import type { SharedQuestion } from '../../types';
import toast from '../../stores/toastStore';

export function CurriculumQuestions({ lessonId }: { lessonId: string }) {
  const [linked, setLinked] = useState<SharedQuestion[]>([]);
  const [bank, setBank] = useState<BankQuestion[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([sharedCurriculum.questions(lessonId), sharedCurriculum.bankQuestions()])
      .then(([questions, bankQuestions]) => { if (active) { setLinked(questions); setBank(bankQuestions); } })
      .catch((error: unknown) => { if (active) toast.error(error instanceof Error ? error.message : 'Không tải được câu hỏi'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [lessonId]);

  async function link() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await sharedCurriculum.linkQuestion(lessonId, selectedId);
      setLinked(await sharedCurriculum.questions(lessonId));
      setSelectedId('');
      toast.success('Đã gắn câu hỏi vào bài');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không gắn được câu hỏi'); }
    finally { setBusy(false); }
  }

  async function unlink(questionId: string) {
    setBusy(true);
    try {
      await sharedCurriculum.unlinkQuestion(lessonId, questionId);
      setLinked((current) => current.filter((question) => question.id !== questionId));
      toast.success('Đã gỡ câu hỏi khỏi bài');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không gỡ được câu hỏi'); }
    finally { setBusy(false); }
  }

  const available = bank.filter((question) => !linked.some((item) => item.id === question.id));
  return <div className="space-y-4">
    <div className="rounded border border-blue-100 bg-blue-50/50 p-4">
      <h4 className="text-sm font-bold text-blue-900">Gắn câu hỏi ngân hàng vào bài</h4>
      <p className="mt-1 text-xs text-slate-600">Liên kết theo ID; câu hỏi vẫn được quản lý ở Ngân hàng câu hỏi. Game chỉ dùng câu trắc nghiệm/điền đáp án.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1"><Label>Câu hỏi chưa gắn</Label><Select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">Chọn câu hỏi</option>{available.map((question) => <option key={question.id} value={question.id}>
            {question.type.toUpperCase()} · {question.content.slice(0, 110)}
          </option>)}</Select></div>
        <Button disabled={!selectedId || busy} onClick={() => void link()}>Gắn vào bài</Button>
        <Link to="/questions" className="rounded border border-slate-200 px-3 py-2 text-xs font-bold text-blue-900 hover:bg-white">Mở ngân hàng câu hỏi</Link>
      </div>
    </div>
    {loading ? <p className="text-xs text-slate-500">Đang tải…</p> : linked.length === 0 ?
      <EmptyState message="Bài này chưa có câu hỏi ôn tập." /> :
      <ul className="space-y-2">{linked.map((question) => <li key={question.link_id} className="flex items-start gap-3 rounded border border-slate-200 p-3 text-sm">
        <div className="min-w-0 flex-1"><p className="font-medium text-slate-700">{question.content}</p>
          <Badge tone={question.type === 'essay' ? 'slate' : 'indigo'}>{question.type === 'essay' ? 'Tự luận' : question.type === 'fill' ? 'Điền đáp án' : 'Trắc nghiệm'}</Badge></div>
        <Button variant="ghost" className="!px-2 !py-1 !text-red-600" disabled={busy} onClick={() => void unlink(question.id)}>Gỡ</Button>
      </li>)}</ul>}
  </div>;
}
