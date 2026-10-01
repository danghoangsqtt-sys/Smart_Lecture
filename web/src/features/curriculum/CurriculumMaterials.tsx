import { useEffect, useState } from 'react';
import { Badge, Button, EmptyState, Input, Label, Modal } from '../../components/ui';
import { sharedCurriculum, uploadSharedMaterial } from '../../lib/sharedCurriculum';
import type { SharedMaterial } from '../../types';
import toast from '../../stores/toastStore';

export function CurriculumMaterials({ lessonId }: { lessonId: string }) {
  const [materials, setMaterials] = useState<SharedMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copyingId, setCopyingId] = useState('');
  const [removeTarget, setRemoveTarget] = useState<SharedMaterial | null>(null);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [fileTitle, setFileTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    void sharedCurriculum.materials(lessonId)
      .then((rows) => { if (active) setMaterials(rows); })
      .catch((error: unknown) => { if (active) toast.error(error instanceof Error ? error.message : 'Không tải được học liệu'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [lessonId]);

  async function refresh() { setMaterials(await sharedCurriculum.materials(lessonId)); }

  async function addLink() {
    if (!linkTitle.trim() || !linkUrl.trim()) return;
    setBusy(true);
    try {
      await sharedCurriculum.addLink(lessonId, linkTitle.trim(), linkUrl.trim());
      setLinkTitle(''); setLinkUrl(''); await refresh(); toast.success('Đã thêm liên kết');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không thêm được liên kết'); }
    finally { setBusy(false); }
  }

  async function addFile() {
    if (!file) return;
    setBusy(true);
    try {
      await uploadSharedMaterial(lessonId, file, fileTitle.trim() || file.name);
      setFile(null); setFileTitle(''); await refresh(); toast.success('Đã tải học liệu lên');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không tải được tệp'); }
    finally { setBusy(false); }
  }

  async function copyLegacy(material: SharedMaterial) {
    setCopyingId(material.id);
    try {
      await sharedCurriculum.copyLegacy(material.id);
      await refresh(); toast.success('Đã sao chép và kiểm tra tệp cũ');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không thể sao chép tệp cũ'); }
    finally { setCopyingId(''); }
  }

  async function remove() {
    if (!removeTarget) return;
    setBusy(true);
    try {
      await sharedCurriculum.deleteMaterial(removeTarget.id);
      setRemoveTarget(null); await refresh(); toast.success('Đã xóa học liệu');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Không xóa được học liệu'); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="rounded border border-blue-100 bg-blue-50/50 p-4">
        <h4 className="mb-3 text-sm font-bold text-blue-900"><i className="fas fa-file-arrow-up mr-2" />Tải slide / video / tài liệu</h4>
        <div><Label>Tên hiển thị (không bắt buộc)</Label><Input value={fileTitle} onChange={(event) => setFileTitle(event.target.value)} maxLength={200} /></div>
        <input type="file" accept=".pdf,.pptx,.docx,.mp4,.webm,.png,.jpg,.jpeg" aria-label="Chọn học liệu"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-3 block w-full text-xs text-slate-600" />
        <p className="mt-2 text-xs text-slate-500">PDF, PowerPoint, Word, video hoặc ảnh. Tệp được lưu một bản dùng chung, không nhân theo lớp.</p>
        <Button className="mt-3" disabled={!file || busy} onClick={() => void addFile()}>{busy ? 'Đang xử lý…' : 'Tải lên'}</Button>
      </div>
      <div className="rounded border border-slate-200 p-4">
        <h4 className="mb-3 text-sm font-bold text-slate-800"><i className="fas fa-link mr-2" />Liên kết ngoài</h4>
        <div><Label>Tên liên kết</Label><Input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} maxLength={200} /></div>
        <div className="mt-2"><Label>Địa chỉ HTTP/HTTPS</Label><Input type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" /></div>
        <Button className="mt-3" variant="secondary" disabled={busy || !linkTitle.trim() || !linkUrl.trim()} onClick={() => void addLink()}>Thêm liên kết</Button>
      </div>
    </div>
    <div>
      <h4 className="mb-2 text-sm font-bold text-slate-700">Học liệu của bài</h4>
      {loading ? <p className="text-xs text-slate-500">Đang tải…</p> : materials.length === 0 ? <EmptyState message="Bài này chưa có học liệu." /> :
        <ul className="space-y-2">{materials.map((material) => <li key={material.id} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-3 text-sm">
          <i className={`fas ${material.type === 'video' ? 'fa-video' : material.type === 'link' ? 'fa-link' : 'fa-file'} text-blue-800`} />
          <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{material.title}</span>
          <Badge tone={material.asset_status === 'ready' ? 'green' : 'amber'}>{material.asset_status === 'ready' ? 'Sẵn sàng' : 'Chờ sao chép'}</Badge>
          {material.asset_status === 'ready' && (material.type === 'link' ? material.link_url : `/api/shared/materials/${material.id}/stream`) &&
            <a href={material.type === 'link' ? material.link_url! : `/api/shared/materials/${material.id}/stream`}
              target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-700 hover:underline">Mở</a>}
          {material.asset_status === 'pending_copy' && material.type !== 'link' &&
            <Button variant="secondary" className="!px-2 !py-1" disabled={!!copyingId} onClick={() => void copyLegacy(material)}>
              {copyingId === material.id ? 'Đang sao chép…' : 'Sao chép tệp cũ'}</Button>}
          <Button variant="ghost" className="!px-2 !py-1 !text-red-600" onClick={() => setRemoveTarget(material)}>Xóa</Button>
        </li>)}</ul>}
    </div>
    <Modal open={!!removeTarget} onClose={() => setRemoveTarget(null)} title="Xóa học liệu?">
      <p className="text-sm text-slate-700">Xóa “{removeTarget?.title}” khỏi bài học? Học liệu cũ đã ánh xạ không thể xóa tại đây.</p>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setRemoveTarget(null)}>Hủy</Button>
        <Button variant="danger" disabled={busy} onClick={() => void remove()}>Xóa học liệu</Button></div>
    </Modal>
  </div>;
}
