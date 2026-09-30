import { useEffect, useState } from 'react';
import { Button, Modal, Select } from './ui';
import { api } from '../lib/api';
import { downloadCredentialCsv, type OneTimeCredential } from '../lib/credentialExport';
import type { RosterPreview, RosterPreviewRow } from '../types';
import toast from '../stores/toastStore';

type ClassOption = { id: string; name: string };
type ImportResult = { created: number; enrolled: number; skipped: number; credentials: OneTimeCredential[]; errors: string[] };

function actionLabel(action: RosterPreviewRow['action']): string {
  if (action === 'create') return 'Tạo mới';
  if (action === 'enroll') return 'Ghi danh';
  if (action === 'skip') return 'Đã có';
  return 'Xung đột';
}

async function responseError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return body?.error?.message ?? `Không thể xử lý file (${response.status})`;
}

export function StudentImportModal({ fixedClassId, onClose, onImported }: {
  fixedClassId?: string;
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState(fixedClassId ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    void api<{ classes: ClassOption[] }>('/classes/mine').then((response) => {
      setClasses(response.classes);
    }).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Không tải được danh sách lớp');
    });
  }, []);

  async function downloadTemplate() {
    if (!classId) return;
    setDownloading(true);
    try {
      const response = await fetch(`/api/classes/${classId}/import-template.xlsx`);
      if (!response.ok) throw new Error(await responseError(response));
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mau-hoc-vien-${Date.now()}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không tải được mẫu Excel');
    } finally {
      setDownloading(false);
    }
  }

  async function sendFile(mode: 'preview' | 'import') {
    if (!classId || !file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const endpoint = mode === 'preview' ? 'import-students/preview' : 'import-students';
      const response = await fetch(`/api/classes/${classId}/${endpoint}`, { method: 'POST', body: form });
      if (!response.ok) throw new Error(await responseError(response));
      if (mode === 'preview') {
        setPreview(await response.json() as RosterPreview);
      } else {
        const imported = await response.json() as ImportResult;
        setResult(imported);
        setPreview(null);
        if (imported.created > 0 || imported.enrolled > 0) await onImported();
        toast.success(`Tạo ${imported.created} học viên, ghi danh ${imported.enrolled}, bỏ qua ${imported.skipped}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể xử lý file');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Nhập học viên từ Excel/CSV" wide>
      <div className="space-y-4 text-sm">
        {!result && (
          <>
            <p className="text-slate-600">Chọn một lớp biên chế cho file. Mỗi dòng cần mã học viên, họ tên và tài khoản; cột Lớp nếu ghi phải khớp lớp đã chọn. Xem trước không thay đổi dữ liệu.</p>
            <div>
              <label htmlFor="student-import-class" className="mb-1 block font-semibold text-slate-700">Lớp biên chế</label>
              <Select id="student-import-class" value={classId} disabled={Boolean(fixedClassId)} onChange={(event) => { setClassId(event.target.value); setPreview(null); }}>
                <option value="">Chọn lớp</option>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </div>
            <Button variant="secondary" disabled={!classId || downloading} onClick={() => void downloadTemplate()}>{downloading ? 'Đang tải…' : 'Tải mẫu Excel'}</Button>
            <div>
              <label htmlFor="student-import-file" className="mb-1 block font-semibold text-slate-700">File danh sách (.xlsx hoặc .csv)</label>
              <input id="student-import-file" type="file" accept=".xlsx,.csv" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); }} className="block w-full text-slate-600 file:mr-3 file:rounded-sm file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Hủy</Button>
              <Button disabled={busy || !classId || !file} onClick={() => void sendFile('preview')}>{busy ? 'Đang đọc…' : 'Xem trước'}</Button>
            </div>
          </>
        )}

        {preview && !result && (
          <section aria-label="Kết quả xem trước" className="space-y-3">
            <p className="font-semibold text-slate-800">Lớp {preview.className}: {preview.summary.create} tạo mới · {preview.summary.enroll} ghi danh · {preview.summary.skip} đã có · {preview.summary.conflict} xung đột</p>
            <div className="max-h-72 overflow-auto rounded-sm border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50"><tr><th className="px-2 py-2">Dòng</th><th className="px-2 py-2">Mã / tài khoản</th><th className="px-2 py-2">Họ tên</th><th className="px-2 py-2">Trạng thái</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((item) => <tr key={item.row}><td className="px-2 py-2">{item.row}</td><td className="px-2 py-2 font-mono">{item.studentCode}<br />{item.username}</td><td className="px-2 py-2">{item.displayName}</td><td className={`px-2 py-2 ${item.action === 'conflict' ? 'text-red-700' : 'text-slate-700'}`}><span className="font-semibold">{actionLabel(item.action)}</span> — {item.message}</td></tr>)}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-amber-800">Khi xác nhận, hệ thống kiểm tra lại dữ liệu hiện tại; kết quả có thể thay đổi nếu tài khoản/lớp vừa được sửa.</p>
            <div className="flex justify-end"><Button disabled={busy || preview.summary.create + preview.summary.enroll === 0} onClick={() => void sendFile('import')}>{busy ? 'Đang nhập…' : 'Xác nhận nhập'}</Button></div>
          </section>
        )}

        {result && (
          <section className="space-y-3" aria-label="Kết quả nhập học viên">
            <p className="font-semibold">Đã tạo {result.created}, ghi danh {result.enrolled}, bỏ qua {result.skipped} dòng.</p>
            {result.errors.length > 0 && <div className="max-h-40 overflow-auto rounded-sm border border-red-200 bg-red-50 p-3 text-red-800">{result.errors.map((message, index) => <p key={`${index}-${message}`}>{message}</p>)}</div>}
            {result.credentials.length > 0 && (
              <>
                <p className="rounded-sm border border-amber-200 bg-amber-50 p-3 text-amber-900">Mật khẩu tạm chỉ hiển thị lần này. Hãy tải CSV và chuyển riêng cho từng học viên; không có mật khẩu cũ nào được xuất.</p>
                <div className="max-h-60 overflow-auto rounded-sm border border-slate-200"><table className="w-full text-left"><thead className="bg-slate-50"><tr><th className="px-2 py-2">Tài khoản</th><th className="px-2 py-2">Mật khẩu tạm</th></tr></thead><tbody>{result.credentials.map((item) => <tr key={item.id}><td className="px-2 py-2 font-mono">{item.username}</td><td className="px-2 py-2 font-mono">{item.temporaryPassword}</td></tr>)}</tbody></table></div>
                <Button variant="secondary" onClick={() => downloadCredentialCsv(result.credentials, `tai-khoan-tam-${Date.now()}.csv`)}>Tải CSV mật khẩu tạm</Button>
              </>
            )}
            <div className="flex justify-end"><Button onClick={onClose}>Đã lưu, đóng</Button></div>
          </section>
        )}
      </div>
    </Modal>
  );
}
