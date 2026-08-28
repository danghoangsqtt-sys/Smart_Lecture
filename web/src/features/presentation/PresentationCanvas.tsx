import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';

GlobalWorkerOptions.workerSrc = workerUrl;

interface PresentationCanvasProps {
  title: string;
  sourceUrl: string;
}

export function PresentationCanvas({ title, sourceUrl }: PresentationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setError(null); setPageNumber(1); setPageCount(0);
        const response = await fetch(sourceUrl);
        if (!response.ok) throw new Error(`Không thể tải tài liệu (${response.status})`);
        const document = await getDocument({ data: await response.arrayBuffer() }).promise;
        if (cancelled) { await document.destroy(); return; }
        documentRef.current = document;
        setPageCount(document.numPages);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không thể mở PDF');
      }
    })();
    return () => { cancelled = true; void documentRef.current?.destroy(); documentRef.current = null; };
  }, [sourceUrl]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const document = documentRef.current;
      const canvas = canvasRef.current;
      if (!document || !canvas || pageCount === 0) return;
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: zoom });
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const context = canvas.getContext('2d');
      if (!context) return;
      await page.render({ canvas, canvasContext: context, viewport, transform: [ratio, 0, 0, ratio, 0, 0] }).promise;
      if (cancelled) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    })().catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể vẽ trang PDF'));
    return () => { cancelled = true; };
  }, [pageNumber, pageCount, zoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight' || event.key === 'PageDown') setPageNumber((page) => Math.min(page + 1, pageCount));
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') setPageNumber((page) => Math.max(page - 1, 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pageCount]);

  if (error) return <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-100">{error}</div>;
  return <section className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900" aria-label={`Trình chiếu ${title}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-3 py-2 text-sm text-slate-200">
      <span className="truncate font-medium">{title}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700 disabled:opacity-40" onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={pageNumber <= 1} aria-label="Trang trước">‹</button>
        <span aria-live="polite">{pageCount ? `${pageNumber} / ${pageCount}` : 'Đang tải…'}</span>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700 disabled:opacity-40" onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))} disabled={pageNumber >= pageCount} aria-label="Trang sau">›</button>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} aria-label="Thu nhỏ">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700" onClick={() => setZoom((value) => Math.min(2.5, value + 0.1))} aria-label="Phóng to">+</button>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700" onClick={() => void containerRef.current?.requestFullscreen()} aria-label="Toàn màn hình">⛶</button>
      </div>
    </div>
    <div ref={containerRef} className="flex max-h-[70vh] min-h-96 justify-center overflow-auto bg-slate-950 p-3">
      <canvas ref={canvasRef} className="max-w-none bg-white shadow-xl" />
    </div>
  </section>;
}
