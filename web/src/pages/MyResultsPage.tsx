import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import toast from '../stores/toastStore';

interface MyResult {
  examTitle: string;
  status: string;
  score: number | null;
  submittedAt: string | null;
  redFlags: number;
}

export default function MyResultsPage() {
  const [results, setResults] = useState<MyResult[] | null>(null);

  useEffect(() => {
    // API gộp trong /exams/available không trả điểm — dùng endpoint riêng nhẹ
    api<{ results: MyResult[] }>('/my-results')
      .then((r) => setResults(r.results))
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Lỗi');
        setResults([]);
      });
  }, []);

  if (results === null) return <Spinner />;

  return (
    <div>
      <PageHeader title="Kết quả học tập" subtitle="Điểm các bài kiểm tra đã làm" />
      {results.length === 0 ? (
        <Card><EmptyState message="Bạn chưa làm bài kiểm tra nào" /></Card>
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <Card key={`${r.examTitle}:${r.submittedAt ?? r.status}`} className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-bold text-slate-800">{r.examTitle}</h3>
                <p className="text-xs text-slate-500">
                  {r.submittedAt ? new Date(r.submittedAt + 'Z').toLocaleString('vi-VN') : '—'}
                  {r.redFlags > 0 && (
                    <span className="text-amber-700"> · <i className="fas fa-triangle-exclamation" /> {r.redFlags} lần rời màn hình</span>
                  )}
                </p>
              </div>
              <span className={`text-2xl font-bold ${r.score === null ? 'text-slate-500' : r.score >= 5 ? 'text-emerald-700' : 'text-red-600'}`}>
                {r.status !== 'submitted' ? '…' : r.score === null ? 'Chờ chấm' : `${r.score.toFixed(2)}`}
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
