import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import toast from '../stores/toastStore';
import { useMyClasses } from './LecturesPage';
import * as XLSX from 'xlsx';

interface Row {
  studentId: string;
  displayName: string;
  kttx: number | null;
  process1: number | null;
  finalExam: number | null;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  periodsAbsent: number;
}

export default function GradebookPage() {
  const classes = useMyClasses();
  const [classId, setClassId] = useState('');
  const [info, setInfo] = useState<{ name: string; sessionTotal: number } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (classes.length > 0 && !classId) setClassId(classes[0].id);
  }, [classes, classId]);

  const load = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const res = await api<{ classInfo: { name: string; sessionTotal: number }; rows: Row[] }>(`/classes/${classId}/gradebook`);
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

  function exportExcel() {
    if (!info) return;
    const aoa = [
      [`SỔ ĐIỂM — ${info.name}`],
      [],
      ['STT', 'Họ tên', 'KTTX', 'Quá trình 1', 'KT kết thúc môn', `Buổi học (${info.sessionTotal})`, 'Đi học', 'Đi muộn', 'Vắng', 'Tiết vắng'],
      ...rows.map((r, i) => [i + 1, r.displayName, r.kttx ?? '', r.process1 ?? '', r.finalExam ?? '', info.sessionTotal, r.presentCount, r.lateCount, r.absentCount, r.periodsAbsent]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sổ điểm');
    XLSX.writeFile(wb, `so-diem-${Date.now()}.xlsx`);
    toast.success('Đã xuất Excel');
  }

  return (
    <div>
      <PageHeader
        title="Sổ điểm"
        subtitle="3 cột điểm: KTTX · Quá trình 1 · KT kết thúc môn — tự lưu khi nhập"
        actions={
          <>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Button variant="secondary" onClick={exportExcel} disabled={!rows.length}>⬇ Excel</Button>
          </>
        }
      />
      {!classId ? (
        <Card><EmptyState message="Chưa có lớp nào" /></Card>
      ) : loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card><EmptyState message="Lớp chưa có học viên" /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Họ tên</th>
                <th className="px-4 py-3">KTTX</th>
                <th className="px-4 py-3">Quá trình 1</th>
                <th className="px-4 py-3">KT cuối môn</th>
                <th className="px-4 py-3 text-center" colSpan={4}>Chuyên cần ({info?.sessionTotal ?? 0} buổi)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((r, i) => (
                <tr key={r.studentId} className="hover:bg-slate-800/40">
                  <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                  <td className="px-4 py-2">{r.displayName}</td>
                  {(['kttx', 'process1', 'finalExam'] as const).map((col) => (
                    <td key={col} className="px-4 py-2">
                      <input
                        type="number" min={0} max={10} step={0.25}
                        value={r[col] ?? ''}
                        placeholder='—'
                        onChange={(e) => void update(r.studentId, col, e.target.value)}
                        className="w-16 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-center text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2 text-center text-emerald-400">{r.presentCount}</td>
                  <td className="px-4 py-2 text-center text-amber-400">{r.lateCount}</td>
                  <td className="px-4 py-2 text-center text-red-400">{r.absentCount}</td>
                  <td className="px-4 py-2 text-center text-red-300">{r.periodsAbsent} tiết</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
