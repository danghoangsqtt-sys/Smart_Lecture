import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Spinner } from '../components/ui';
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
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

const STATUS_LABEL: Record<RagDoc['status'], { label: string; tone: 'slate' | 'amber' | 'green' | 'red'; pulse?: boolean }> = {
  pending: { label: 'Đang chờ', tone: 'slate' },
  parsing: { label: 'Đang xử lý…', tone: 'amber', pulse: true },
  ready: { label: 'Sẵn sàng', tone: 'green' },
  error: { label: 'Lỗi', tone: 'red' },
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
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', content: question }]);
    setThinking(true);
    try {
      const res = await api<{ answer: string; sources: Source[] }>('/rag/chat', {
        method: 'POST',
        body: JSON.stringify({ question, history }),
      });
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'assistant', content: res.answer, sources: res.sources }]);
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
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm bg-blue-900 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition hover:bg-slate-800">
            {uploading ? 'Đang tải…' : '+ Nạp tài liệu'}
            <input type="file" accept=".pdf,.docx,.pptx,.txt,.md" className="hidden" disabled={uploading}
              onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          </label>
        }
      />

      {stats && (
        <div className="mb-4 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><i className="fas fa-file-lines text-blue-700" /> {stats.docs} tài liệu sẵn sàng</span>
          <span className="flex items-center gap-1.5"><i className="fas fa-puzzle-piece text-blue-700" /> {stats.chunks} khối</span>
          <span className="flex items-center gap-1.5"><i className="fas fa-brain text-blue-700" /> {stats.embedded} khối đã nhúng vector{stats.embedded === 0 && stats.chunks > 0 && ' (chế độ từ khóa — thêm API key để tăng độ chính xác)'}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="h-fit p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Kho tài liệu</h3>
          {docs.length === 0 ? (
            <EmptyState message="Chưa có tài liệu. Nạp PDF/DOCX/PPTX/TXT." />
          ) : (
            <ul className="space-y-2">
              {docs.map((d) => (
                <li key={d.id} className="rounded-sm border border-slate-200 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{d.filename}</span>
                    <button onClick={async () => {
                      if (!window.confirm(`Xóa "${d.filename}" khỏi kho?`)) return;
                      try { await api(`/rag/documents/${d.id}`, { method: 'DELETE' }); await loadDocs(); }
                      catch (e) { toast.error(e instanceof Error ? e.message : 'Lỗi'); }
                    }} aria-label={`Xóa tài liệu ${d.filename}`} className="text-xs text-red-600 hover:text-red-700"><i className="fas fa-xmark" /></button>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className={STATUS_LABEL[d.status].pulse ? 'animate-pulse' : ''}>
                      <Badge tone={STATUS_LABEL[d.status].tone}>{STATUS_LABEL[d.status].label}</Badge>
                    </span>
                    {d.page_count > 0 && <span className="text-slate-600">{d.page_count} trang</span>}
                    {(d.status === 'pending' || d.status === 'parsing') && <Spinner />}
                  </div>
                  {d.error_msg && <p className="mt-1 line-clamp-2 text-xs text-red-600">{d.error_msg}</p>}
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
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-sm px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user' ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-800'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 border-t border-slate-200 pt-2">
                      <p className="mb-1 text-xs font-medium text-slate-500">Nguồn tham chiếu:</p>
                      <ul className="space-y-1">
                        {msg.sources.map((s, si) => (
                          <li key={si} className="rounded-sm border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500">
                            <i className="fas fa-file-lines text-blue-700" /> <b className="text-slate-700">{s.docName}</b>, trang {s.page}
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
                <div className="animate-pulse rounded-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-500">Trợ giảng đang đọc tài liệu…</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); void ask(); }}
            className="flex gap-2 border-t border-slate-200 p-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nhập câu hỏi cho trợ giảng…"
              className="flex-1"
            />
            <Button type="submit" disabled={thinking || !input.trim()}>Gửi</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
