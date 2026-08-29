import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState, type PointerEvent } from 'react';

GlobalWorkerOptions.workerSrc = workerUrl;

interface PresentationCanvasProps {
  title: string;
  sourceUrl: string;
}

type Tool = 'pen' | 'highlight' | 'ellipse' | 'line' | 'underline' | 'laser' | 'eraser';
interface Stroke { tool: Exclude<Tool, 'laser' | 'eraser'>; points: Array<{ x: number; y: number }>; page: number; color?: string; }
interface AnnotationSettings { penColor?: string; highlightColor?: string; }
interface AnnotationAction {
  kind: 'add' | 'remove' | 'clear-page';
  stroke?: Stroke;
  index?: number;
  removed?: Array<{ stroke: Stroke; index: number }>;
}

const PRIMARY_POINTER_TOOLS: Array<{ tool: Tool; label: string; icon: string; hint: string }> = [
  { tool: 'laser', label: 'Tia laser', icon: 'fa-bullseye', hint: 'Chỉ hiện tạm thời khi đang chỉ trên trang chiếu (phím L)' },
  { tool: 'pen', label: 'Bút lông', icon: 'fa-pen', hint: 'Vẽ và ghi chú trực tiếp lên trang chiếu (phím P)' },
  { tool: 'highlight', label: 'Highlight', icon: 'fa-highlighter', hint: 'Tô sáng nội dung trọng tâm (phím H)' },
];

const ADVANCED_POINTER_TOOLS: Array<{ tool: Tool; label: string; icon: string }> = [
  { tool: 'ellipse', label: 'Khoanh tròn', icon: 'fa-circle' },
  { tool: 'underline', label: 'Gạch chân', icon: 'fa-underline' },
  { tool: 'line', label: 'Đường thẳng', icon: 'fa-minus' },
];

const INK_COLORS = [
  { label: 'Màu đỏ', value: '#ef4444' }, { label: 'Màu xanh dương', value: '#2563eb' },
  { label: 'Màu xanh lá', value: '#16a34a' }, { label: 'Màu đen', value: '#111827' },
];
const HIGHLIGHT_COLORS = [
  { label: 'Highlight vàng', value: '#facc15' }, { label: 'Highlight xanh lá', value: '#84cc16' },
  { label: 'Highlight hồng', value: '#f472b6' }, { label: 'Highlight xanh dương', value: '#60a5fa' },
];

export function PresentationCanvas({ title, sourceUrl }: PresentationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [surface, setSurface] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<Tool>('pen');
  const [penColor, setPenColor] = useState('#ef4444');
  const [highlightColor, setHighlightColor] = useState('#facc15');
  const [settingsReadyFor, setSettingsReadyFor] = useState<string | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [undoHistory, setUndoHistory] = useState<AnnotationAction[]>([]);
  const [redoHistory, setRedoHistory] = useState<AnnotationAction[]>([]);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [laser, setLaser] = useState<{ x: number; y: number } | null>(null);
  const inkColor = tool === 'highlight' ? highlightColor : penColor;
  const selectTool = (nextTool: Tool) => setTool(nextTool);

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
    try { setStrokes(JSON.parse(sessionStorage.getItem(`smartlecture:annotations:${sourceUrl}`) ?? '[]') as Stroke[]); } catch { setStrokes([]); }
    setUndoHistory([]); setRedoHistory([]);
  }, [sourceUrl]);
  useEffect(() => {
    sessionStorage.setItem(`smartlecture:annotations:${sourceUrl}`, JSON.stringify(strokes.slice(-100)));
  }, [sourceUrl, strokes]);
  useEffect(() => {
    setSettingsReadyFor(null);
    try {
      const settings = JSON.parse(sessionStorage.getItem(`smartlecture:annotation-settings:${sourceUrl}`) ?? '{}') as AnnotationSettings;
      setPenColor(INK_COLORS.some((color) => color.value === settings.penColor) ? settings.penColor! : INK_COLORS[0]!.value);
      setHighlightColor(HIGHLIGHT_COLORS.some((color) => color.value === settings.highlightColor) ? settings.highlightColor! : HIGHLIGHT_COLORS[0]!.value);
    } catch {
      setPenColor(INK_COLORS[0]!.value);
      setHighlightColor(HIGHLIGHT_COLORS[0]!.value);
    }
    setSettingsReadyFor(sourceUrl);
  }, [sourceUrl]);
  useEffect(() => {
    if (settingsReadyFor !== sourceUrl) return;
    sessionStorage.setItem(`smartlecture:annotation-settings:${sourceUrl}`, JSON.stringify({ penColor, highlightColor } satisfies AnnotationSettings));
  }, [sourceUrl, penColor, highlightColor, settingsReadyFor]);

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
      setSurface({ width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
      const context = canvas.getContext('2d');
      if (!context) return;
      await page.render({ canvas, canvasContext: context, viewport, transform: [ratio, 0, 0, ratio, 0, 0] }).promise;
      if (cancelled) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    })().catch((cause) => setError(cause instanceof Error ? cause.message : 'Không thể vẽ trang PDF'));
    return () => { cancelled = true; };
  }, [pageNumber, pageCount, zoom]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') setPageNumber((page) => Math.min(page + 1, pageCount));
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') setPageNumber((page) => Math.max(page - 1, 1));
      if (event.key.toLowerCase() === 'l') { event.preventDefault(); selectTool('laser'); }
      if (event.key.toLowerCase() === 'p') { event.preventDefault(); selectTool('pen'); }
      if (event.key.toLowerCase() === 'h') { event.preventDefault(); selectTool('highlight'); }
      if (event.key.toLowerCase() === 'e') { event.preventDefault(); selectTool('eraser'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pageCount, penColor, highlightColor]);

  const point = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };
  const start = (event: PointerEvent<SVGSVGElement>) => {
    const next = point(event); event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'laser') { setLaser(next); return; }
    if (tool === 'eraser') { eraseAt(next); return; }
    setDraft({ tool, page: pageNumber, points: [next], color: inkColor });
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const next = point(event);
    if (tool === 'laser') { setLaser(next); return; }
    if (tool === 'eraser') return;
    setDraft((value) => value ? { ...value, points: [...value.points, next] } : null);
  };
  const finish = () => {
    if (tool === 'laser') { setLaser(null); return; }
    if (tool === 'eraser') return;
    if (draft && draft.points.length > 1) {
      setStrokes((items) => {
        const next = [...items.slice(-99), draft];
        setUndoHistory((history) => [...history.slice(-99), { kind: 'add', stroke: draft, index: next.length - 1 }]);
        return next;
      });
      setRedoHistory([]);
    }
    setDraft(null);
  };
  const eraseAt = (target: { x: number; y: number }) => setStrokes((items) => {
    let index = -1;
    for (let candidate = items.length - 1; candidate >= 0; candidate -= 1) {
      const stroke = items[candidate]!;
      const threshold = stroke.tool === 'highlight' ? 0.045 : 0.025;
      if (stroke.page === pageNumber && stroke.points.some((point) => Math.hypot(point.x - target.x, point.y - target.y) <= threshold)) { index = candidate; break; }
    }
    if (index < 0) return items;
    const removed = items[index]!;
    setUndoHistory((history) => [...history.slice(-99), { kind: 'remove', stroke: removed, index }]);
    setRedoHistory([]);
    return [...items.slice(0, index), ...items.slice(index + 1)];
  });
  const eraseStroke = (target: Stroke) => {
    if (tool !== 'eraser') return;
    setStrokes((items) => {
      const index = items.lastIndexOf(target);
      if (index < 0) return items;
      setUndoHistory((history) => [...history.slice(-99), { kind: 'remove', stroke: target, index }]);
      setRedoHistory([]);
      return [...items.slice(0, index), ...items.slice(index + 1)];
    });
  };
  const restoreAt = (items: Stroke[], stroke: Stroke, index: number) => items.some((item) => item === stroke) ? items : [...items.slice(0, index), stroke, ...items.slice(index)];
  const restoreRemoved = (items: Stroke[], removed: Array<{ stroke: Stroke; index: number }>) => removed.slice().sort((a, b) => a.index - b.index).reduce((next, item) => restoreAt(next, item.stroke, item.index), items);
  const removeActionStrokes = (items: Stroke[], action: AnnotationAction) => action.kind === 'clear-page' ? items.filter((item) => !action.removed?.some((removed) => removed.stroke === item)) : items.filter((item) => item !== action.stroke);
  const undo = () => setUndoHistory((history) => {
    const action = history.at(-1);
    if (!action) return history;
    setStrokes((items) => action.kind === 'add' ? removeActionStrokes(items, action) : action.kind === 'remove' && action.stroke ? restoreAt(items, action.stroke, action.index ?? items.length) : restoreRemoved(items, action.removed ?? []));
    setRedoHistory((redo) => [...redo.slice(-99), action]);
    return history.slice(0, -1);
  });
  const redo = () => setRedoHistory((history) => {
    const action = history.at(-1);
    if (!action) return history;
    setStrokes((items) => action.kind === 'add' && action.stroke ? restoreAt(items, action.stroke, action.index ?? items.length) : removeActionStrokes(items, action));
    setUndoHistory((undoItems) => [...undoItems.slice(-99), action]);
    return history.slice(0, -1);
  });
  const clearCurrentPage = () => setStrokes((items) => {
    const removed = items.flatMap((stroke, index) => stroke.page === pageNumber ? [{ stroke, index }] : []);
    if (removed.length === 0) return items;
    setUndoHistory((history) => [...history.slice(-99), { kind: 'clear-page', removed }]);
    setRedoHistory([]);
    return items.filter((item) => item.page !== pageNumber);
  });
  const renderStroke = (stroke: Stroke, key: string) => {
    const points = stroke.points.map((item) => `${item.x * surface.width},${item.y * surface.height}`).join(' ');
    const style = stroke.tool === 'highlight' ? { stroke: stroke.color ?? '#facc15', strokeOpacity: 0.45, strokeWidth: 18 } : { stroke: stroke.color ?? '#ef4444', strokeOpacity: 1, strokeWidth: stroke.tool === 'underline' ? 4 : 3 };
    const removeOnTouch = tool === 'eraser' ? (event: PointerEvent<SVGElement>) => { event.preventDefault(); event.stopPropagation(); eraseStroke(stroke); } : undefined;
    if (stroke.tool === 'ellipse' && stroke.points.length > 1) { const a = stroke.points[0]!; const b = stroke.points.at(-1)!; return <ellipse key={key} cx={(a.x + b.x) * surface.width / 2} cy={(a.y + b.y) * surface.height / 2} rx={Math.abs(a.x - b.x) * surface.width / 2} ry={Math.abs(a.y - b.y) * surface.height / 2} fill="none" onPointerDown={removeOnTouch} {...style} />; }
    return <polyline key={key} points={points} fill="none" strokeLinecap="round" strokeLinejoin="round" onPointerDown={removeOnTouch} {...style} />;
  };

  if (error) return <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-100">{error}</div>;
  return <section className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-900" aria-label={`Trình chiếu ${title}`}>
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
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700 disabled:opacity-40" disabled={undoHistory.length === 0} onClick={undo} aria-label="Hoàn tác">↶</button>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700 disabled:opacity-40" disabled={redoHistory.length === 0} onClick={redo} aria-label="Làm lại">↷</button>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700" onClick={clearCurrentPage} aria-label="Xoá nét trang hiện tại">Xoá trang</button>
      </div>
    </div>
    <div ref={containerRef} className="flex max-h-[70vh] min-h-96 justify-center overflow-auto bg-slate-950 p-3">
      <div className="relative" style={{ width: surface.width || undefined, height: surface.height || undefined }}>
        <canvas ref={canvasRef} className="max-w-none bg-white shadow-xl" />
        {surface.width > 0 && <svg className="absolute inset-0 touch-none" width={surface.width} height={surface.height} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
          {strokes.filter((item) => item.page === pageNumber).map((item, index) => renderStroke(item, `${item.page}-${index}`))}
          {draft && renderStroke(draft, 'draft')}
          {laser && <circle cx={laser.x * surface.width} cy={laser.y * surface.height} r="8" fill="#ef4444" fillOpacity="0.8" />}
        </svg>}
      </div>
    </div>
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-xl border border-slate-500/70 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur" role="toolbar" aria-label="Công cụ bút trình chiếu">
        {PRIMARY_POINTER_TOOLS.map((item) => <button key={item.tool} type="button" onClick={() => selectTool(item.tool)} title={item.hint} aria-label={item.label} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition ${tool === item.tool ? item.tool === 'highlight' ? 'bg-yellow-300 text-slate-950' : item.tool === 'laser' ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-slate-700'}`}><i className={`fas ${item.icon}`} />{item.label}</button>)}
        {(tool === 'pen' || tool === 'highlight') && <><span className="mx-1 h-7 w-px bg-slate-600" aria-hidden="true" />{(tool === 'highlight' ? HIGHLIGHT_COLORS : INK_COLORS).map((color) => <button key={color.value} type="button" aria-label={color.label} title={color.label} onClick={() => tool === 'highlight' ? setHighlightColor(color.value) : setPenColor(color.value)} className={`h-6 w-6 rounded-full border-2 ${inkColor === color.value ? 'border-white scale-110' : 'border-slate-500'} transition`} style={{ backgroundColor: color.value }} />)}</>}
        <span className="mx-1 h-7 w-px bg-slate-600" aria-hidden="true" />
        {ADVANCED_POINTER_TOOLS.map((item) => <button key={item.tool} type="button" onClick={() => selectTool(item.tool)} title={item.label} aria-label={item.label} className={`rounded-lg px-2.5 py-2 text-xs transition ${tool === item.tool ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-slate-700'}`}><i className={`fas ${item.icon}`} /></button>)}
        <button type="button" onClick={undo} title="Hoàn tác thao tác vừa thực hiện" aria-label="Hoàn tác nét vẽ" className="rounded-lg px-2.5 py-2 text-slate-200 hover:bg-slate-700"><i className="fas fa-rotate-left" /></button>
        <button type="button" onClick={() => selectTool('eraser')} title="Chạm vào một nét để xóa" aria-label="Tẩy từng nét" className={`rounded-lg px-2.5 py-2 ${tool === 'eraser' ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-slate-700'}`}><i className="fas fa-eraser" /></button>
        <button type="button" onClick={clearCurrentPage} title="Xóa tất cả nét của trang hiện tại" aria-label="Xóa nét trang hiện tại" className="rounded-lg px-2.5 py-2 text-slate-200 hover:bg-slate-700"><i className="fas fa-eraser" /></button>
      </div>
    </div>
  </section>;
}
