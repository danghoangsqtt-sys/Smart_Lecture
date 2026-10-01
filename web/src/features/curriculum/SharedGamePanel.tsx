import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import type { SharedQuestion } from '../../types';
import type { GameSessionInfo } from '../../pages/GamesPage';
import toast from '../../stores/toastStore';

const GamesPage = lazy(() => import('../../pages/GamesPage'));

export function SharedGamePanel({ classId, lessonTitle, questions, onExit }: {
  classId: string;
  lessonTitle: string;
  questions: SharedQuestion[];
  onExit: () => void;
}) {
  const [session, setSession] = useState<GameSessionInfo | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [librarySessionActive, setLibrarySessionActive] = useState(false);
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

  return <div data-shared-game-stage className="fixed inset-0 z-[70] flex h-dvh w-screen flex-col bg-slate-950 text-white">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-blue-700 bg-blue-950 px-4 py-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-blue-300">Sân khấu trò chơi · {lessonTitle}</p>
        <h2 className="text-lg font-black">{session || librarySessionActive ? 'Phòng trò chơi đang hoạt động' : showLibrary ? 'Chọn trò chơi' : 'Ôn tập theo bài'}</h2></div>
      <div className="flex flex-wrap gap-2">
        {showLibrary && !librarySessionActive && <Button variant="secondary" onClick={() => setShowLibrary(false)}>Trở về bài này</Button>}
        <Button variant="secondary" onClick={onExit}><i className="fas fa-window-minimize" /> Thu về bài giảng</Button>
      </div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-3 text-slate-900 sm:p-6">
      {session ? <Suspense fallback={<Spinner />}><GamesPage key={session.id} initialSession={session} initialClassId={classId}
        lockedClassId={classId} autoShowGuides={false} /></Suspense> : showLibrary ?
        <Suspense fallback={<Spinner />}><GamesPage initialClassId={classId} lockedClassId={classId} autoShowGuides={false}
          onGameLaunched={() => setLibrarySessionActive(true)} /></Suspense> :
        <div className="mx-auto max-w-4xl space-y-5">
          <div className="rounded border border-blue-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-blue-950">Game nhanh từ câu hỏi của bài</h3>
            <p className="mt-2 text-sm text-slate-600">{usable.length} câu trắc nghiệm/điền đáp án đã liên kết. Câu hỏi được cố định khi game bắt đầu.</p>
            {questions.length > usable.length && <p className="mt-2 text-xs text-amber-700">{questions.length - usable.length} câu tự luận không dùng cho game nhanh.</p>}
            {usable.length > 50 && <p className="mt-2 text-xs text-amber-700">Game nhanh tối đa 50 câu. Hãy chia bài hoặc gỡ bớt câu trước khi tạo.</p>}
            <Button className="mt-4" disabled={busy || usable.length === 0 || usable.length > 50} onClick={() => void launch()}>
              <i className="fas fa-bolt" /> {busy ? 'Đang tạo phòng…' : 'Tạo game nhanh từ bài này'}</Button>
          </div>
          <div className="rounded border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-black text-blue-950">Trò chơi khác</h3>
            <p className="mt-2 text-sm text-slate-600">Chọn loại game từ thư viện. Lớp hiện tại được giữ cố định khi tạo phòng.</p>
            <div className="mt-4 flex flex-wrap items-center gap-4"><Button variant="secondary" onClick={() => setShowLibrary(true)}>
              <i className="fas fa-gamepad" /> Chọn trò chơi khác</Button>
              <Link to="/games" className="text-xs font-bold text-blue-800 hover:underline">Quản lý phiên game →</Link></div>
          </div>
        </div>}
    </div>
  </div>;
}
