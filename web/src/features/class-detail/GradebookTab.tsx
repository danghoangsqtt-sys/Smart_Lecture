import { useCallback, useEffect, useState } from 'react';
import { Button, Card, EmptyState, Modal, Spinner, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import toast from '../../stores/toastStore';
import type { GradeRow } from './types';

interface GroupGradeRow { groupId: string; groupName: string; kttx: number | null; process1: number | null; finalExam: number | null; remark: string }

export async function downloadExcelWorkbook(filename: string, sheetName: string, rows: Array<Array<string | number>>) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRows(rows);
  const blob = new Blob([await workbook.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function GradebookTab({ classId, canManage }: { classId: string; canManage: boolean }) {
  const [info, setInfo] = useState<{ name: string; sessionTotal: number } | null>(null);
  const [rows, setRows] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarkFor, setRemarkFor] = useState<GradeRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ classInfo: { name: string; sessionTotal: number }; rows: GradeRow[] }>(`/classes/${classId}/gradebook`);
      setInfo(res.classInfo);
      setRows(res.rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { void load(); }, [load]);

  async function update(studentId: string, col: 'kttx' | 'process1' | 'finalExam', value: string) {
    const num = value === '' ? null : Math.min(10, Math.max(0, Number(value)));
    if (value !== '' && Number.isNaN(num as number)) return;
    setRows((rs) => rs.map((r) => (r.studentId === studentId ? { ...r, [col]: num } : r)));
    try {
      await api(`/classes/${classId}/grades/${studentId}`, { method: 'PUT', body: JSON.stringify({ [col]: num }) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu điểm');
      await load();
    }
  }

  async function exportExcel() {
    if (!info) return;
    const aoa = [
      [`SỔ ĐIỂM — ${info.name}`],
      [],
      ['STT', 'Họ tên', 'KTTX', 'Quá trình 1', 'KT kết thúc môn', `Buổi học (${info.sessionTotal})`, 'Đi học', 'Vắng', 'Tiết vắng', 'Nhận xét'],
      ...rows.map((r, i) => [i + 1, r.displayName, r.kttx ?? '', r.process1 ?? '', r.finalExam ?? '', info.sessionTotal, r.presentCount, r.absentCount, r.periodsAbsent, r.remark]),
    ];
    await downloadExcelWorkbook(`so-diem-${Date.now()}.xlsx`, 'Sổ điểm', aoa);
    toast.success('Đã xuất Excel');
  }

  if (loading) return <Spinner />;
  if (rows.length === 0) return <Card><EmptyState message="Lớp chưa có học viên" /></Card>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" onClick={() => void exportExcel()}><i className="fas fa-download" /> Excel</Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Họ tên</th>
              <th className="px-4 py-3">KTTX</th>
              <th className="px-4 py-3">Quá trình 1</th>
              <th className="px-4 py-3">KT cuối môn</th>
              <th className="px-4 py-3 text-center" colSpan={3}>Chuyên cần ({info?.sessionTotal ?? 0} buổi)</th>
              <th className="px-4 py-3">Nhận xét</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((r, i) => (
              <tr key={r.studentId} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                <td className="px-4 py-2">{r.displayName}</td>
                {(['kttx', 'process1', 'finalExam'] as const).map((col) => (
                  <td key={col} className="px-4 py-2">
                    {canManage ? (
                      <input
                        aria-label={`Điểm ${col} của ${r.displayName}`}
                        type="number" min={0} max={10} step={0.25}
                        value={r[col] ?? ''}
                        placeholder="—"
                        onChange={(e) => void update(r.studentId, col, e.target.value)}
                        className="w-16 rounded-sm border border-slate-300 bg-white px-2 py-1 text-center text-sm text-slate-800 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
                      />
                    ) : (
                      <span className="font-semibold">{r[col] ?? '—'}</span>
                    )}
                  </td>
                ))}
                <td className="px-4 py-2 text-center text-emerald-700">{r.presentCount}</td>
                <td className="px-4 py-2 text-center text-red-600">{r.absentCount}</td>
                <td className="px-4 py-2 text-center text-red-500">{r.periodsAbsent} tiết</td>
                <td className="px-4 py-2 max-w-[180px]">
                  {canManage ? (
                    <button onClick={() => setRemarkFor(r)} className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs font-medium text-slate-600 hover:bg-slate-100">
                      <i className={`fas ${r.remark ? 'fa-comment text-blue-900' : 'fa-comment-slash text-slate-400'}`} />
                      <span className="truncate">{r.remark || 'Thêm nhận xét'}</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-600">{r.remark || '—'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {remarkFor && (
        <RemarkModal
          row={remarkFor}
          classId={classId}
          onClose={() => setRemarkFor(null)}
          onSaved={(text) => setRows((rs) => rs.map((r) => (r.studentId === remarkFor.studentId ? { ...r, remark: text } : r)))}
        />
      )}
    </div>
  );
}

type RemarkRow = GradeRow | GroupGradeRow;

function isGroupRow(row: RemarkRow): row is GroupGradeRow {
  return 'groupId' in row;
}

export function RemarkModal({ row, classId, onClose, onSaved }: { row: RemarkRow; classId: string; onClose: () => void; onSaved: (text: string) => void }) {
  const [text, setText] = useState(row.remark);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const rowIsGroup = isGroupRow(row);

  async function aiSuggest() {
    if (rowIsGroup) return;
    setBusy(true);
    try {
      const res = await api<{ comment: string }>('/ai/comment-gradebook', {
        method: 'POST',
        body: JSON.stringify({
          studentName: row.displayName,
          kttx: row.kttx,
          process1: row.process1,
          finalExam: row.finalExam,
          presentCount: 'presentCount' in row ? row.presentCount : 0,
          absentCount: 'absentCount' in row ? row.absentCount : 0,
        }),
      });
      setText(res.comment);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi AI');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      if (rowIsGroup) {
        await api(`/classes/${classId}/group-grades/${row.groupId}`, { method: 'PUT', body: JSON.stringify({ remark: text }) });
      } else {
        await api(`/classes/${classId}/grades/${row.studentId}`, { method: 'PUT', body: JSON.stringify({ remark: text }) });
      }
      onSaved(text);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi lưu nhận xét');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Nhận xét — ${rowIsGroup ? row.groupName : row.displayName}`}>
      <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Nhận xét…" />
      <div className="mt-3 flex justify-between">
        {!rowIsGroup && <Button variant="secondary" onClick={() => void aiSuggest()} disabled={busy}>
          <i className="fas fa-robot" /> {busy ? 'Đang tạo…' : 'AI gợi ý'}
        </Button>}
        <Button onClick={() => void save()} disabled={saving}>Lưu</Button>
      </div>
    </Modal>
  );
}
