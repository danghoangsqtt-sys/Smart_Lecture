import { PresentationCanvas } from '../presentation/PresentationCanvas';
import type { SharedMaterial } from '../../types';

export type SharedContentMode = 'slides' | 'video' | 'links';

export function SharedTeachingViewer({ materials, mode }: { materials: SharedMaterial[]; mode: SharedContentMode }) {
  const ready = materials.filter((material) => material.asset_status === 'ready');
  const filtered = mode === 'slides'
    ? ready.filter((material) => material.type === 'pdf' || material.type === 'pptx')
    : mode === 'video' ? ready.filter((material) => material.type === 'video')
      : ready.filter((material) => material.type === 'link' || material.type === 'docx' || material.type === 'image');
  if (filtered.length === 0) return <div className="flex min-h-72 items-center justify-center rounded border border-dashed border-slate-600 p-8 text-center text-sm text-slate-400">
    Bài này chưa có {mode === 'slides' ? 'slide PDF/PowerPoint' : mode === 'video' ? 'video' : 'liên kết hoặc tài liệu'} sẵn sàng.
  </div>;

  return <div className="space-y-4">{filtered.map((material) => {
    const streamUrl = `/api/shared/materials/${material.id}/stream`;
    const target = material.type === 'link' ? material.link_url : streamUrl;
    return <div key={material.id} className="rounded border border-slate-700 bg-slate-800 p-4 text-white">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{material.title}</h3>
        {target && <a href={target} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-300 hover:underline">Mở toàn màn hình ↗</a>}
      </div>
      {material.type === 'pdf' && <PresentationCanvas title={material.title} sourceUrl={streamUrl} />}
      {material.type === 'pptx' && <p className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
        Trình duyệt không chiếu PPTX trực tiếp. Mở tệp gốc bằng PowerPoint, hoặc thêm bản PDF của slide để dùng bút và canvas trong ứng dụng.
      </p>}
      {material.type === 'video' && <video src={streamUrl} controls className="w-full rounded bg-black" />}
      {material.type === 'image' && <img src={streamUrl} alt={material.title} className="max-h-[70vh] w-auto rounded object-contain" />}
      {(material.type === 'docx' || material.type === 'link') && <p className="text-sm text-slate-300">
        {material.type === 'link' ? 'Mở liên kết tham khảo trong cửa sổ mới.' : 'Mở tài liệu Word bằng ứng dụng trên máy.'}
      </p>}
    </div>;
  })}</div>;
}
