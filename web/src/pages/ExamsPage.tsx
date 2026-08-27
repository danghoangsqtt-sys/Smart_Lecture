import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Badge, Button, Card, EmptyState, Input, Label, Modal, PageHeader, Select, Spinner } from '../components/ui';
import toast from '../stores/toastStore';
import { useMyClasses } from './LecturesPage';

interface Question {
  id: string;
  type: 'mcq' | 'essay';
  content: string;
  bloomLevel: string;
  folderId: string | null;
}

interface ExamInfo {
  id: string;
  title: string;
  durationMin: number;
  questionCount: number;
  status: string;
  config: {
    startAt: string | null;
    endAt: string | null;
    hasPassword: boolean;
    maxAttempts: number;
    purpose: string;
    classId: string | null;
    shuffleQuestions: boolean;
    shuffleOptions: boolean;
  };
}

const BLOOM_LEVELS = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'];

interface PrintData {
  exam: { title: string; durationMin: number };
  questions: { id: string; type: string; content: string; options?: string[] }[];
  key: { no: number; type: string; letter: string | null; correctText: string | null }[];
}

async function printExam(examId: string) {
  try {
    const data = await api<PrintData>(`/exams/${examId}/print-data`);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const qHtml = data.questions
      .map((q, i) => {
        const opts =
          q.options && q.options.length > 0
            ? `<div class="opts">${q.options.map((o) => `<span class="opt">${esc(o)}</span>`).join('')}</div>`
            : '';
        return `<div class="q"><b>Câu ${i + 1}.</b> ${esc(q.content)}${opts}</div>`;
      })
      .join('\n');
    const keyHtml = data.key.map((k) => `<span class="keycell">${k.no}.${k.type === 'mcq' ? k.letter : '…'}</span>`).join('');
    const essayKeys = data.key
      .flatMap((k) => k.type !== 'mcq' ? [`<div class="essaykey"><b>Câu ${k.no}:</b> ${esc(k.correctText ?? '')}</div>`] : [])
      .join('');

    const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(data.exam.title)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'Times New Roman', serif; font-size: 12.5pt; color: #000; }
  .header { text-align: center; margin-bottom: 10pt; }
  .org { display:flex; justify-content:space-between; font-style:italic; font-size:11pt; }
  .title { font-weight:bold; text-transform:uppercase; margin-top:8pt; font-size:14pt; }
  .meta { text-align:center; font-style:italic; }
  .q { break-inside: avoid; margin-top: 9pt; text-align: justify; }
  .opts { display:grid; grid-template-columns: 1fr 1fr; gap:2pt 16pt; margin-left:14pt; margin-top:3pt; }
  .opt { break-inside: avoid; }
  .pagebreak { page-break-before: always; }
  h2 { text-align:center; font-size:13pt; }
  .keys { display:grid; grid-template-columns: repeat(8, 1fr); gap:4pt; font-size:11pt; }
  .keycell { border:1px solid #000; padding:3pt 0; text-align:center; }
  .essaykey { margin-top:6pt; font-size:11.5pt; }
</style></head><body>
<div class="header">
  <div class="org"><span>SỞ / PHÒNG: ……………………</span><span>TRƯỜNG: ……………………</span></div>
  <div class="title">ĐỀ KIỂM TRA</div>
  <div class="meta">Môn: ……………………… — Thời gian: ${data.exam.durationMin} phút</div>
</div>
<div class="org" style="margin-bottom:6pt"><span>Họ tên: ……………………………</span><span>Lớp: …………… SBD: ………</span></div>
${qHtml}
<div class="pagebreak"></div>
<h2>BẢNG ĐÁP ÁN (dành cho giáo viên)</h2>
<div class="keys">${keyHtml}</div>
${essayKeys}
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 400); };</script>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Trình duyệt chặn cửa sổ in — cho phép popup rồi thử lại');
      return;
    }
    win.document.write(html);
    win.document.close();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Lỗi lấy dữ liệu đề');
  }
}

export default function ExamsPage() {
  const [exams, setExams] = useState<ExamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const classes = useMyClasses();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ exams: ExamInfo[] }>('/exams/mine');
      setExams(res.exams);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải đề thi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div>
      <PageHeader title="Đề thi" subtitle="Soạn đề từ ngân hàng câu hỏi theo ma trận Bloom" actions={<Button onClick={() => setCreateOpen(true)}>+ Soạn đề mới</Button>} />
      {loading ? <Spinner /> : exams.length === 0 ? (
        <Card><EmptyState message="Chưa có đề thi nào" /></Card>
      ) : (
        <div className="space-y-3">
          {exams.map((e) => (
            <Card key={e.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-800">{e.title}</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {e.questionCount} câu · {e.durationMin} phút · tối đa {e.config.maxAttempts} lượt
                  {e.config.hasPassword && (<> · <i className="fas fa-lock" /> có mật khẩu</>)}
                  {e.config.purpose === 'homework' ? ' · BTVN' : ''}
                </p>
                <p className="text-xs text-slate-500">
                  Lớp: {classes.find((c) => c.id === e.config.classId)?.name ?? '—'}
                  {e.config.startAt && ` · mở ${new Date(e.config.startAt).toLocaleString('vi-VN')}`}
                  {e.config.endAt && ` → đóng ${new Date(e.config.endAt).toLocaleString('vi-VN')}`}
                </p>
              </div>
              <Badge tone={e.status === 'published' ? 'green' : 'slate'}>{e.status === 'published' ? 'Đang phát hành' : 'Đã đóng'}</Badge>
              <Link to={`/exams/${e.id}/results`} className="inline-flex items-center justify-center gap-2 rounded-sm bg-blue-900 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-md transition hover:bg-slate-800">Kết quả</Link>
              <Button variant="ghost" onClick={() => void printExam(e.id)}><i className="fas fa-print" /> In A4</Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  if (!window.confirm(e.status === 'published' ? 'Đóng đề thi (học viên không vào được nữa)?' : 'Phát hành lại đề thi?')) return;
                  try {
                    await api(`/exams/${e.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: e.status === 'published' ? 'closed' : 'published' }) });
                    await load();
                  } catch (err) { toast.error(err instanceof Error ? err.message : 'Lỗi'); }
                }}
              >
                {e.status === 'published' ? 'Đóng' : 'Mở lại'}
              </Button>
              <Button
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                onClick={async () => {
                  if (!window.confirm('Xóa đề thi? Kết quả thi liên quan cũng bị xóa.')) return;
                  try {
                    await api(`/exams/${e.id}`, { method: 'DELETE' });
                    toast.success('Đã xóa');
                    await load();
                  } catch (err) { toast.error(err instanceof Error ? err.message : 'Lỗi'); }
                }}
              >
                Xóa
              </Button>
            </Card>
          ))}
        </div>
      )}
      <CreateExamModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
    </div>
  );
}

function CreateExamModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => Promise<void> }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState('');
  const [durationMin, setDurationMin] = useState(45);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [matrix, setMatrix] = useState<Record<string, number>>({});
  const [folderId, setFolderId] = useState('');
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [config, setConfig] = useState({ startAt: '', endAt: '', password: '', maxAttempts: 1, purpose: 'online_test', classId: '', shuffleQ: true, shuffleO: true });
  const [busy, setBusy] = useState(false);
  const classes = useMyClasses();

  useEffect(() => {
    if (open) {
      api<{ questions: Question[] }>('/questions?limit=1000').then((r) => setQuestions(r.questions)).catch(() => undefined);
      api<{ folders: { id: string; name: string }[] }>('/questions/folders').then((r) => setFolders(r.folders)).catch(() => undefined);
    }
  }, [open]);

  function autoPick() {
    const pool = questions.filter((question) => (!folderId || question.folderId === folderId));
    const picked = new Set<string>();
    let shortage = false;
    for (const level of BLOOM_LEVELS) {
      const need = matrix[level] ?? 0;
      const candidates = pool.filter((question) => question.bloomLevel === level && !picked.has(question.id));
      if (candidates.length < need) shortage = true;
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const ti = candidates[i]; const tj = candidates[j];
        if (ti && tj) { candidates[i] = tj; candidates[j] = ti; }
      }
      for (const c of candidates.slice(0, need)) picked.add(c.id);
    }
    setSelectedIds(picked);
    if (shortage) toast.info('Một số mức Bloom không đủ câu trong kho — đã chọn hết mức đó');
    else toast.success(`Đã chọn ${picked.size} câu theo ma trận`);
  }

  async function submit() {
    if (selectedIds.size === 0) { toast.error('Chưa chọn câu hỏi nào'); return; }
    setBusy(true);
    try {
      await api('/exams', {
        method: 'POST',
        body: JSON.stringify({
          title,
          durationMin,
          questionIds: [...selectedIds],
          config: {
            start_at: config.startAt || null,
            end_at: config.endAt || null,
            password: config.password || undefined,
            shuffle_questions: config.shuffleQ,
            shuffle_options: config.shuffleO,
            max_attempts: Number(config.maxAttempts),
            purpose: config.purpose,
            class_id: config.classId || null,
          },
        }),
      });
      toast.success('Đã tạo và phát hành đề thi');
      onClose(); setStep(1); setSelectedIds(new Set());
      await onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tạo đề');
    } finally {
      setBusy(false);
    }
  }

  const previewPool = questions.filter((question) => selectedIds.has(question.id));

  return (
    <Modal open={open} onClose={onClose} title="Soạn đề thi" wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Tên đề *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Thời lượng (phút)</Label><Input type="number" min={1} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} /></div>
        </div>

        <div className="rounded-sm border border-slate-200 p-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Ma trận Bloom → số câu mong muốn</h4>
          <div className="grid grid-cols-4 gap-2">
            {BLOOM_LEVELS.map((b) => (
              <div key={b}>
                <Label>{b}</Label>
                <Input type="number" min={0} value={matrix[b] ?? ''} onChange={(e) => setMatrix((m) => ({ ...m, [b]: Number(e.target.value) }))} className="text-center" />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-end gap-2">
            <div className="flex-1"><Label>Kho nguồn</Label>
              <Select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
                <option value="">Tất cả câu hỏi của tôi</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </div>
            <Button variant="secondary" className="mb-[1px]" onClick={autoPick}><i className="fas fa-dice" /> Chọn tự động theo ma trận</Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">Đã chọn: <b className="text-blue-900">{selectedIds.size}</b> câu. Có thể tick thủ công bên dưới.</p>
        </div>

        <details className="rounded-sm border border-slate-200" open={step === 2}>
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-slate-700">Chọn chi tiết câu hỏi ({previewPool.length})</summary>
          <ul className="max-h-56 space-y-0.5 overflow-y-auto px-3 pb-3">
            {questions.map((question) => (
              <li key={question.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedIds.has(question.id)}
                    onChange={(e) =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(question.id); else next.delete(question.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-slate-800">{question.content}</span>
                  <Badge tone={question.type === 'mcq' ? 'indigo' : 'amber'}>{question.type === 'mcq' ? 'TN' : 'TL'}</Badge>
                  {question.bloomLevel && <span className="shrink-0 text-xs text-slate-500">{question.bloomLevel}</span>}
                </label>
              </li>
            ))}
          </ul>
        </details>

        <div className="grid gap-3 rounded-sm border border-slate-200 p-4 sm:grid-cols-2">
          <div><Label>Mở lúc (tùy chọn)</Label><Input type="datetime-local" value={config.startAt} onChange={(e) => setConfig((c) => ({ ...c, startAt: e.target.value }))} /></div>
          <div><Label>Đóng lúc (tùy chọn)</Label><Input type="datetime-local" value={config.endAt} onChange={(e) => setConfig((c) => ({ ...c, endAt: e.target.value }))} /></div>
          <div><Label>Mật khẩu phòng thi</Label><Input value={config.password} onChange={(e) => setConfig((c) => ({ ...c, password: e.target.value }))} placeholder="Bỏ trống nếu không dùng" /></div>
          <div><Label>Số lượt làm tối đa</Label><Input type="number" min={1} max={99} value={config.maxAttempts} onChange={(e) => setConfig((c) => ({ ...c, maxAttempts: Number(e.target.value) }))} /></div>
          <div><Label>Giao cho lớp</Label>
            <Select value={config.classId} onChange={(e) => setConfig((c) => ({ ...c, classId: e.target.value }))}>
              <option value="">— Chọn lớp —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div><Label>Mục đích</Label>
            <Select value={config.purpose} onChange={(e) => setConfig((c) => ({ ...c, purpose: e.target.value }))}>
              <option value="online_test">Kiểm tra online</option>
              <option value="homework">Bài tập về nhà</option>
            </Select>
          </div>
          <div className="flex items-end space-x-4 text-sm text-slate-600">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={config.shuffleQ} onChange={(e) => setConfig((c) => ({ ...c, shuffleQ: e.target.checked }))} /> Xáo câu</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={config.shuffleO} onChange={(e) => setConfig((c) => ({ ...c, shuffleO: e.target.checked }))} /> Xáo phương án</label>
          </div>
        </div>


        <div className="flex justify-between">
          <p className="pt-2 text-xs text-slate-500">Xáo trộn dùng thuật toán Fisher–Yates, đáp án đúng luôn được bảo toàn.</p>
          <Button onClick={() => void submit()} disabled={busy || !title || selectedIds.size === 0}>Tạo đề & phát hành</Button>
        </div>
      </div>
    </Modal>
  );
}
