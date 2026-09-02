import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useReducer, useRef, useState, type PointerEvent } from 'react';

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
interface AnnotationState { strokes: Stroke[]; undoHistory: AnnotationAction[]; redoHistory: AnnotationAction[]; }
type AnnotationEvent =
  | { type: 'add'; stroke: Stroke }
  | { type: 'erase-at'; target: { x: number; y: number }; page: number }
  | { type: 'erase-stroke'; stroke: Stroke }
  | { type: 'clear-page'; page: number }
  | { type: 'undo' }
  | { type: 'redo' };

const PRIMARY_POINTER_TOOLS: Array<{ tool: Tool; label: string; icon: string; hint: string }> = [
  { tool: 'laser', label: 'Tia laser', icon: 'fa-bullseye', hint: 'Chỉ hiện tạm thời khi đang chỉ trên trang chiếu (phím L)' },
  { tool: 'pen', label: 'Bút lông', icon: 'fa-pen', hint: 'Vẽ và ghi chú trực tiếp lên trang chiếu (phím P)' },
  { tool: 'highlight', label: 'Highlight', icon: 'fa-highlighter', hint: 'Tô sáng nội dung trọng tâm (phím H)' },
];

const ADVANCED_POINTER_TOOLS: Array<{ tool: Tool; label: string; icon: string; shortcut: string }> = [
  { tool: 'ellipse', label: 'Khoanh tròn', icon: 'fa-circle', shortcut: 'C' },
  { tool: 'underline', label: 'Gạch chân', icon: 'fa-underline', shortcut: 'U' },
  { tool: 'line', label: 'Đường thẳng', icon: 'fa-minus', shortcut: 'D' },
];

const INK_COLORS = [
  { label: 'Màu đỏ', value: '#ef4444' }, { label: 'Màu xanh dương', value: '#2563eb' },
  { label: 'Màu xanh lá', value: '#16a34a' }, { label: 'Màu đen', value: '#111827' },
];
const HIGHLIGHT_COLORS = [
  { label: 'Highlight vàng', value: '#facc15' }, { label: 'Highlight xanh lá', value: '#84cc16' },
  { label: 'Highlight hồng', value: '#f472b6' }, { label: 'Highlight xanh dương', value: '#60a5fa' },
];

function annotationStorageKey(kind: 'annotations' | 'annotation-settings', sourceUrl: string): string {
  const materialId = sourceUrl.match(/\/api\/media\/([^/]+)\/stream/)?.[1];
  return `smartlecture:${kind}:${materialId ?? sourceUrl}`;
}

function storedPresentationValue(kind: 'annotations' | 'annotation-settings', sourceUrl: string, fallback: string): string {
  const key = annotationStorageKey(kind, sourceUrl);
  const legacyKey = `smartlecture:${kind}:${sourceUrl}`;
  const stored = sessionStorage.getItem(key);
  const legacy = sessionStorage.getItem(legacyKey);
  const value = stored ?? legacy ?? fallback;
  if (!stored && legacy) sessionStorage.setItem(key, value);
  return value;
}

function initialAnnotationState(sourceUrl: string): AnnotationState {
  try {
    return { strokes: JSON.parse(storedPresentationValue('annotations', sourceUrl, '[]')) as Stroke[], undoHistory: [], redoHistory: [] };
  } catch {
    return { strokes: [], undoHistory: [], redoHistory: [] };
  }
}

function initialAnnotationSettings(sourceUrl: string): Required<AnnotationSettings> {
  try {
    const saved = JSON.parse(storedPresentationValue('annotation-settings', sourceUrl, '{}')) as AnnotationSettings;
    return {
      penColor: INK_COLORS.some((color) => color.value === saved.penColor) ? saved.penColor! : INK_COLORS[0]!.value,
      highlightColor: HIGHLIGHT_COLORS.some((color) => color.value === saved.highlightColor) ? saved.highlightColor! : HIGHLIGHT_COLORS[0]!.value,
    };
  } catch {
    return { penColor: INK_COLORS[0]!.value, highlightColor: HIGHLIGHT_COLORS[0]!.value };
  }
}

function normalizedPointerPoint(event: PointerEvent<SVGSVGElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
}

function strokeRenderIdentity(stroke: Stroke): string {
  const first = stroke.points[0];
  const last = stroke.points.at(-1);
  return `${stroke.page}:${stroke.tool}:${stroke.color ?? ''}:${stroke.points.length}:${first?.x ?? 0}:${first?.y ?? 0}:${last?.x ?? 0}:${last?.y ?? 0}`;
}

function appendHistory<T>(history: T[], value: T): T[] { return [...history.slice(-99), value]; }
function restoreAt(items: Stroke[], stroke: Stroke, index: number): Stroke[] { return items.some((item) => item === stroke) ? items : [...items.slice(0, index), stroke, ...items.slice(index)]; }
function restoreRemoved(items: Stroke[], removed: Array<{ stroke: Stroke; index: number }>): Stroke[] { return removed.slice().sort((a, b) => a.index - b.index).reduce((next, item) => restoreAt(next, item.stroke, item.index), items); }
function removeActionStrokes(items: Stroke[], action: AnnotationAction): Stroke[] { return action.kind === 'clear-page' ? items.filter((item) => !action.removed?.some((removed) => removed.stroke === item)) : items.filter((item) => item !== action.stroke); }
function annotationReducer(state: AnnotationState, event: AnnotationEvent): AnnotationState {
  if (event.type === 'add') {
    const strokes = [...state.strokes.slice(-99), event.stroke];
    return { strokes, undoHistory: appendHistory(state.undoHistory, { kind: 'add', stroke: event.stroke, index: strokes.length - 1 }), redoHistory: [] };
  }
  if (event.type === 'erase-at') {
    let index = -1;
    for (let candidate = state.strokes.length - 1; candidate >= 0; candidate -= 1) {
      const stroke = state.strokes[candidate]!;
      const threshold = stroke.tool === 'highlight' ? 0.045 : 0.025;
      if (stroke.page === event.page && stroke.points.some((point) => Math.hypot(point.x - event.target.x, point.y - event.target.y) <= threshold)) { index = candidate; break; }
    }
    if (index < 0) return state;
    const stroke = state.strokes[index]!;
    return { strokes: [...state.strokes.slice(0, index), ...state.strokes.slice(index + 1)], undoHistory: appendHistory(state.undoHistory, { kind: 'remove', stroke, index }), redoHistory: [] };
  }
  if (event.type === 'erase-stroke') {
    const index = state.strokes.lastIndexOf(event.stroke);
    if (index < 0) return state;
    return { strokes: [...state.strokes.slice(0, index), ...state.strokes.slice(index + 1)], undoHistory: appendHistory(state.undoHistory, { kind: 'remove', stroke: event.stroke, index }), redoHistory: [] };
  }
  if (event.type === 'clear-page') {
    const removed = state.strokes.flatMap((stroke, index) => stroke.page === event.page ? [{ stroke, index }] : []);
    if (removed.length === 0) return state;
    return { strokes: state.strokes.filter((stroke) => stroke.page !== event.page), undoHistory: appendHistory(state.undoHistory, { kind: 'clear-page', removed }), redoHistory: [] };
  }
  if (event.type === 'undo') {
    const action = state.undoHistory.at(-1);
    if (!action) return state;
    const strokes = action.kind === 'add' ? removeActionStrokes(state.strokes, action) : action.kind === 'remove' && action.stroke ? restoreAt(state.strokes, action.stroke, action.index ?? state.strokes.length) : restoreRemoved(state.strokes, action.removed ?? []);
    return { strokes, undoHistory: state.undoHistory.slice(0, -1), redoHistory: appendHistory(state.redoHistory, action) };
  }
  const action = state.redoHistory.at(-1);
  if (!action) return state;
  const strokes = action.kind === 'add' && action.stroke ? restoreAt(state.strokes, action.stroke, action.index ?? state.strokes.length) : removeActionStrokes(state.strokes, action);
  return { strokes, undoHistory: appendHistory(state.undoHistory, action), redoHistory: state.redoHistory.slice(0, -1) };
}

function AnnotationStroke({ stroke, surface, eraserActive, onErase }: {
  stroke: Stroke;
  surface: { width: number; height: number };
  eraserActive: boolean;
  onErase: (stroke: Stroke) => void;
}) {
  const points = stroke.points.map((item) => `${item.x * surface.width},${item.y * surface.height}`).join(' ');
  const style = stroke.tool === 'highlight'
    ? { stroke: stroke.color ?? '#facc15', strokeOpacity: 0.45, strokeWidth: 18 }
    : { stroke: stroke.color ?? '#ef4444', strokeOpacity: 1, strokeWidth: stroke.tool === 'underline' ? 4 : 3 };
  const removeOnTouch = eraserActive ? (event: PointerEvent<SVGElement>) => { event.preventDefault(); event.stopPropagation(); onErase(stroke); } : undefined;
  if (stroke.tool === 'ellipse' && stroke.points.length > 1) {
    const first = stroke.points[0]!;
    const last = stroke.points.at(-1)!;
    return <ellipse cx={(first.x + last.x) * surface.width / 2} cy={(first.y + last.y) * surface.height / 2} rx={Math.abs(first.x - last.x) * surface.width / 2} ry={Math.abs(first.y - last.y) * surface.height / 2} fill="none" onPointerDown={removeOnTouch} {...style} />;
  }
  return <polyline points={points} fill="none" strokeLinecap="round" strokeLinejoin="round" onPointerDown={removeOnTouch} {...style} />;
}

export function PresentationCanvas({ title, sourceUrl }: PresentationCanvasProps) {
  return <PresentationDocument key={sourceUrl} title={title} sourceUrl={sourceUrl} />;
}

function PresentationDocument({ title, sourceUrl }: PresentationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const presentationRef = useRef<HTMLElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [surface, setSurface] = useState({ width: 0, height: 0 });
  const [tool, setTool] = useState<Tool>('pen');
  const [annotationSettings, setAnnotationSettings] = useState(() => initialAnnotationSettings(sourceUrl));
  const [annotations, dispatchAnnotations] = useReducer(annotationReducer, sourceUrl, initialAnnotationState);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const draftRef = useRef<Stroke | null>(null);
  const [laser, setLaser] = useState<{ x: number; y: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { penColor, highlightColor } = annotationSettings;
  const setPenColor = (penColor: string) => setAnnotationSettings((current) => ({ ...current, penColor }));
  const setHighlightColor = (highlightColor: string) => setAnnotationSettings((current) => ({ ...current, highlightColor }));
  const inkColor = tool === 'highlight' ? highlightColor : penColor;
  const selectTool = (nextTool: Tool) => setTool(nextTool);
  const annotationKey = annotationStorageKey('annotations', sourceUrl);
  const settingsKey = annotationStorageKey('annotation-settings', sourceUrl);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
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
    sessionStorage.setItem(annotationKey, JSON.stringify(annotations.strokes.slice(-100)));
  }, [annotationKey, annotations.strokes]);
  useEffect(() => {
    sessionStorage.setItem(settingsKey, JSON.stringify({ penColor, highlightColor } satisfies AnnotationSettings));
  }, [settingsKey, penColor, highlightColor]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const document = documentRef.current;
      const canvas = canvasRef.current;
      if (!document || !canvas || pageCount === 0) return;
      const page = await document.getPage(pageNumber);
      if (cancelled) return;
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
    })().catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không thể vẽ trang PDF'); });
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
      if (event.key.toLowerCase() === 'c') { event.preventDefault(); selectTool('ellipse'); }
      if (event.key.toLowerCase() === 'u') { event.preventDefault(); selectTool('underline'); }
      if (event.key.toLowerCase() === 'd') { event.preventDefault(); selectTool('line'); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pageCount, penColor, highlightColor]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === presentationRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const start = (event: PointerEvent<SVGSVGElement>) => {
    const next = normalizedPointerPoint(event); event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === 'laser') { setLaser(next); return; }
    if (tool === 'eraser') { eraseAt(next); return; }
    const nextDraft = { tool, page: pageNumber, points: [next], color: inkColor } as Stroke;
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const next = normalizedPointerPoint(event);
    if (tool === 'laser') { setLaser(next); return; }
    if (tool === 'eraser') return;
    const value = draftRef.current;
    if (!value) return;
    const nextDraft = { ...value, points: [...value.points, next] };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };
  const finish = () => {
    if (tool === 'laser') { setLaser(null); return; }
    if (tool === 'eraser') return;
    const value = draftRef.current;
    if (value && value.points.length > 1) dispatchAnnotations({ type: 'add', stroke: value });
    draftRef.current = null;
    setDraft(null);
  };
  const eraseAt = (target: { x: number; y: number }) => dispatchAnnotations({ type: 'erase-at', target, page: pageNumber });
  const eraseStroke = (target: Stroke) => {
    if (tool !== 'eraser') return;
    dispatchAnnotations({ type: 'erase-stroke', stroke: target });
  };
  const undo = () => dispatchAnnotations({ type: 'undo' });
  const redo = () => dispatchAnnotations({ type: 'redo' });
  const clearCurrentPage = () => dispatchAnnotations({ type: 'clear-page', page: pageNumber });
  const toggleFullscreen = async () => {
    if (document.fullscreenElement === presentationRef.current) await document.exitFullscreen();
    else await presentationRef.current?.requestFullscreen();
  };
  const strokeOccurrences = new Map<string, number>();
  const pageStrokeElements = annotations.strokes.flatMap((stroke) => {
    if (stroke.page !== pageNumber) return [];
    const identity = strokeRenderIdentity(stroke);
    const occurrence = strokeOccurrences.get(identity) ?? 0;
    strokeOccurrences.set(identity, occurrence + 1);
    return [<AnnotationStroke key={`${identity}:${occurrence}`} stroke={stroke} surface={surface} eraserActive={tool === 'eraser'} onErase={eraseStroke} />];
  });

  if (error) return <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5 text-sm text-amber-100">{error}</div>;
  return <section ref={presentationRef} className="relative flex flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 fullscreen:h-screen fullscreen:rounded-none" aria-label={`Trình chiếu ${title}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 px-3 py-2 text-sm text-slate-200">
      <span className="truncate font-medium">{title}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700 disabled:opacity-40" onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={pageNumber <= 1} aria-label="Trang trước">‹</button>
        <span aria-live="polite">{pageCount ? `${pageNumber} / ${pageCount}` : 'Đang tải…'}</span>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700 disabled:opacity-40" onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))} disabled={pageNumber >= pageCount} aria-label="Trang sau">›</button>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} aria-label="Thu nhỏ">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700" onClick={() => setZoom((value) => Math.min(2.5, value + 0.1))} aria-label="Phóng to">+</button>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700" onClick={() => void toggleFullscreen()} aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}>{isFullscreen ? '×' : '⛶'}</button>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700 disabled:opacity-40" disabled={annotations.undoHistory.length === 0} onClick={undo} aria-label="Hoàn tác">↶</button>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700 disabled:opacity-40" disabled={annotations.redoHistory.length === 0} onClick={redo} aria-label="Làm lại">↷</button>
        <button type="button" className="rounded px-2 py-1 hover:bg-slate-700" onClick={clearCurrentPage} aria-label="Xoá nét trang hiện tại">Xoá trang</button>
      </div>
    </div>
    <div className="flex max-h-[70vh] min-h-96 flex-1 justify-center overflow-auto bg-slate-950 p-3 fullscreen:max-h-none">
      <div className="relative" style={{ width: surface.width || undefined, height: surface.height || undefined }}>
        <canvas ref={canvasRef} className="max-w-none bg-white shadow-xl" />
        {surface.width > 0 && <svg className="absolute inset-0 touch-none" width={surface.width} height={surface.height} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
          {pageStrokeElements}
          {draft && <AnnotationStroke stroke={draft} surface={surface} eraserActive={tool === 'eraser'} onErase={eraseStroke} />}
          {laser && <circle cx={laser.x * surface.width} cy={laser.y * surface.height} r="8" fill="#ef4444" fillOpacity="0.8" />}
        </svg>}
      </div>
    </div>
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-xl border border-slate-500/70 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur" role="toolbar" aria-label="Công cụ bút trình chiếu">
        {PRIMARY_POINTER_TOOLS.map((item) => <button key={item.tool} type="button" onClick={() => selectTool(item.tool)} title={item.hint} aria-label={item.label} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition ${tool === item.tool ? item.tool === 'highlight' ? 'bg-yellow-300 text-slate-950' : item.tool === 'laser' ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-slate-700'}`}><i className={`fas ${item.icon}`} />{item.label}</button>)}
        {tool !== 'laser' && tool !== 'eraser' && <><span className="mx-1 h-7 w-px bg-slate-600" aria-hidden="true" />{(tool === 'highlight' ? HIGHLIGHT_COLORS : INK_COLORS).map((color) => <button key={color.value} type="button" aria-label={color.label} title={color.label} onClick={() => tool === 'highlight' ? setHighlightColor(color.value) : setPenColor(color.value)} className={`h-6 w-6 rounded-full border-2 ${inkColor === color.value ? 'border-white scale-110' : 'border-slate-500'} transition`} style={{ backgroundColor: color.value }} />)}</>}
        <span className="mx-1 h-7 w-px bg-slate-600" aria-hidden="true" />
        {ADVANCED_POINTER_TOOLS.map((item) => <button key={item.tool} type="button" onClick={() => selectTool(item.tool)} title={`${item.label} (phím ${item.shortcut})`} aria-label={item.label} className={`rounded-lg px-2.5 py-2 text-xs transition ${tool === item.tool ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-slate-700'}`}><i className={`fas ${item.icon}`} /></button>)}
        <button type="button" onClick={undo} title="Hoàn tác thao tác vừa thực hiện" aria-label="Hoàn tác nét vẽ" className="rounded-lg px-2.5 py-2 text-slate-200 hover:bg-slate-700"><i className="fas fa-rotate-left" /></button>
        <button type="button" onClick={() => selectTool('eraser')} title="Chạm vào một nét để xóa" aria-label="Tẩy từng nét" className={`rounded-lg px-2.5 py-2 ${tool === 'eraser' ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-slate-700'}`}><i className="fas fa-eraser" /></button>
        <button type="button" onClick={clearCurrentPage} title="Xóa tất cả nét của trang hiện tại" aria-label="Xóa nét trang hiện tại" className="rounded-lg px-2.5 py-2 text-slate-200 hover:bg-slate-700"><i className="fas fa-eraser" /></button>
      </div>
    </div>
  </section>;
}
