import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import type { SharedQuestion } from '../../types';
import type { GameSessionInfo } from '../../pages/GamesPage';
import toast from '../../stores/toastStore';

const GamesPage = lazy(() => import('../../pages/GamesPage'));

export function SharedGamePanel({ classId, lessonTitle, questions }: {
  classId: string;
  lessonTitle: string;
  questions: SharedQuestion[];
}) {
  const [session, setSession] = useState<GameSessionInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const usable = questions.filter((question) => question.type === 'mcq' || question.type === 'fill');

  async function launch() {
    if (usable.length === 0 || usable.length > 50) return;
    setBusy(true);
    try {
      const title = `Ôn tập: ${lessonTitle}`;
      const created = await api<{ id: string; roomCode: string }>('/games', {
        method: 'POST', body: JSON.stringify({
          gameType: 'quick_quiz', classId, title, questionIds: usable.map((question) => question.id),
        }),
      });
      setSession({ id: created.id, roomCode: created.roomCode, gameType: 'quick_quiz', status: 'lobby',
        questionCount: usable.length, config: { title, secondsPerQuestion: 20 } });
      toast.success('Đã tạo phòng game từ câu hỏi của bài');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không tạo được game'); }
    finally { setBusy(false); }
  }

  if (session) return <div className="min-h-96 overflow-auto rounded border border-slate-700 bg-slate-50">
    <Suspense fallback={<Spinner />}><GamesPage key={session.id} initialSession={session} initialClassId={classId}
      lockedClassId={classId} autoShowGuides={false} /></Suspense>
  </div>;
  return <div className="rounded border border-slate-700 bg-slate-800 p-6 text-white">
    <h3 className="text-lg font-black">Trò chơi ôn tập theo bài</h3>
    <p className="mt-2 text-sm text-slate-300">{usable.length} câu trắc nghiệm/điền đáp án đã gắn bài. Trò chơi dùng một phòng cho lớp đang chọn; câu hỏi được cố định khi bắt đầu.</p>
    {questions.length > usable.length && <p className="mt-2 text-xs text-amber-200">{questions.length - usable.length} câu tự luận không dùng cho game nhanh.</p>}
    {usable.length > 50 && <p className="mt-2 text-xs text-amber-200">Game nhanh tối đa 50 câu. Hãy chia bài hoặc gỡ bớt câu trước khi tạo.</p>}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button disabled={busy || usable.length === 0 || usable.length > 50} onClick={() => void launch()}>
        <i className="fas fa-gamepad" /> {busy ? 'Đang tạo phòng…' : 'Tạo game từ bài này'}</Button>
      <Link to="/games" className="text-xs font-bold text-blue-200 hover:underline">Quản lý các phiên game →</Link>
    </div>
  </div>;
}
