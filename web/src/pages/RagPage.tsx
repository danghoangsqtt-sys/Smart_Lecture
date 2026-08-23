import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import toast from '../stores/toastStore';

interface RagDoc {
  id: string;
  filename: string;
  status: 'pending' | 'parsing' | 'ready' | 'error';
  error_msg: string | null;
  page_count: number;
  size_bytes: number;
}

interface Source {
  docName: string;
  page: number;
  heading: string;
  snippet: string;
  score: number;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

const STATUS_LABEL: Record<RagDoc['status'], { label: string; cls: string }> = {
  pending: { label: 'Đang chờ', cls: 'bg-slate-800 text-slate-400 ring-slate-700' },
  parsing: { label: 'Đang xử lý…', cls: 'bg-amber-950 text-amber-400 ring-amber-800 animate-pulse' },
  ready: { label: 'Sẵn sàng', cls: 'bg-emerald-950 text-emerald-400 ring-emerald-800' },
  error: { label: 'Lỗi', cls: 'bg-red-950 text-red-400 ring-red-800' },
};

export default function RagPage() {
  const [docs, setDocs] = useState<RagDoc[]>([]);
  const [stats, setStats] = useState<{ docs: number; chunks: number; embedded: number } | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadDocs = useCallback(async () => {
    try {
      const res = await api<{ documents: RagDoc[]; stats: typeof stats }>('/rag/documents');
      setDocs(res.documents);
      setStats(res.stats);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    }
  }, []);

  useEffect(() => {
    void loadDocs();
    const t = setInterval(() => void loadDocs(), 3000);
    return () => clearInterval(t);
  }, [loadDocs]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = (await import('../stores/authStore')).useAuthStore.getState().token;
      const res = await fetch('/api/rag/documents', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? 'Tải lên thất bại');
      }
      toast.success('Đã tải lên — đang xử lý thành các khối tri thức');
      await loadDocs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setUploading(false);
    }
  }

  async function ask() {
    const question = input.trim();
    if (!question || thinking) return;
    setInput('');
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setThinking(true);
    try {
      const res = await api<{ answer: string; sources: Source[] }>('/rag/chat', {
        method: 'POST',
        body: JSON.stringify({ question, history }),
      });
      setMessages((m) => [...m, { role: 'assistant', content: res.answer, sources: res.sources }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi AI');
    } finally {
      setThinking(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Trợ giảng AI (RAG)"
        subtitle="Nạp tài liệu môn học → hỏi đáp có trích dẫn nguồn & trang"
        actions={
          <label className="cursor-pointer rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-500">
            {uploading ? 'Đang tải…' : '+ Nạp tài liệu'}
            <input type="file" accept=".pdf,.docx,.pptx,.txt,.md" className="hidden" disabled={uploading}
              onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          </label>
        }
      />

      {stats && (
        <div className="mb-4 flex gap-3 text-xs text-slate-500">
          <span>📄 {stats.docs} tài liệu sẵn sàng</span>
          <span>🧩 {stats.chunks} khối</span>
          <span>🧠 {stats.embedded} khối đã nhúng vector{stats.embedded === 0 && stats.chunks > 0 && ' (chế độ từ khóa — thêm API key để tăng độ chính xác)'}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="h-fit p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Kho tài liệu</h3>
          {docs.length === 0 ? (
            <EmptyState message="Chưa có tài liệu. Nạp PDF/DOCX/PPTX/TXT." />
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="rounded-xl px-3 py-2.5 ring-1 ring-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{d.filename}</span>
                    <button onClick={async () => {
                      if (!window.confirm(`Xóa "${d.filename}" khỏi kho?`)) return;
                      try { await api(`/rag/documents/${d.id}`, { method: 'DELETE' }); await loadDocs(); }
                      catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
                    }} className="text-xs text-red-400 hover:text-red-300">×</button>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className={`rounded-md px-1.5 py-0.5 ring-1 ${STATUS_LABEL[d.status].cls}`}>{STATUS_LABEL[d.status].label}</span>
                    {d.page_count > 0 && <span className="text-slate-600">{d.page_count} trang</span>}
                    {(d.status === 'pending' || d.status === 'parsing') && <Spinner />}
                  </div>
                  {d.error_msg && <p className="mt-1 line-clamp-2 text-xs text-red-400">{d.error_msg}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex h-[70vh] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && !thinking && (
              <EmptyState message='Hỏi bất kỳ điều gì về tài liệu đã nạp — ví dụ: "Tóm tắt chương 1", "Có những biện pháp an toàn nào?"' />
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 border-t border-slate-700 pt-2">
                      <p className="mb-1 text-xs font-medium text-slate-400">Nguồn tham chiếu:</p>
                      <ul className="space-y-1">
                        {msg.sources.map((s, si) => (
                          <li key={si} className="rounded-lg bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-400">
                            📄 <b className="text-slate-300">{s.docName}</b>, trang {s.page}
                            {s.heading && ` — ${s.heading}`}
                            <p className="mt-0.5 line-clamp-2 italic text-slate-500">{s.snippet}…</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="flex justify-start">
                <div className="animate-pulse rounded-2xl bg-slate-800 px-4 py-2.5 text-sm text-slate-400">Trợ giảng đang đọc tài liệu…</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); void ask(); }}
            className="flex gap-2 border-t border-slate-800 p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nhập câu hỏi cho trợ giảng…"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
            <Button type="submit" disabled={thinking || !input.trim()}>Gửi</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
