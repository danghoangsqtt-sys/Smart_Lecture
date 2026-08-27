import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import toast from '../stores/toastStore';

/* ============================================================
   CONSTANTS & TYPES
============================================================ */
const GRID = 20;
const PIN_R = 4.5;
const LED_COLORS = [['#ef4444', 'Đỏ'], ['#22c55e', 'Xanh'], ['#eab308', 'Vàng'], ['#3b82f6', 'Xanh dương']] as const;

type LogicState = boolean;
type EditorMode = 'select' | 'wire' | 'erase';

interface Pt { x: number; y: number }

interface PinDef {
  id: string;
  x: number;
  y: number;
  dir: 'in' | 'out';
  label?: string;
}

interface CompDef {
  id: string;
  name: string;
  cat: 'passive' | 'source' | 'io' | 'logic' | 'probe' | 'transistor';
  w: number;
  h: number;
  pins: PinDef[];
  defaults?: Record<string, unknown>;
  evaluable?: boolean;
}

interface Comp {
  id: string;
  type: string;
  x: number;
  y: number;
  rot: number;
  props: Record<string, any>;
}

interface Wire {
  id: string;
  from: string; // `${compId}::${pinId}`
  to: string;
}

export interface CircuitData {
  components: Comp[];
  wires: Wire[];
}

interface Props {
  gameType: 'circuit_draw' | 'circuit_simulate';
  initialData?: CircuitData | null;
  onChange?: (data: CircuitData) => void;
  onSubmitCircuit?: (data: CircuitData) => void;
}

/* ============================================================
   COMPONENT LIBRARY  (pins in LOCAL coords, origin = center)
============================================================ */
function lp(id: string, x: number, y: number, dir: 'in' | 'out', label?: string): PinDef {
  return { id, x, y, dir, label };
}

const DEFS: Record<string, CompDef> = {
  /* ---------- PASSIVE ---------- */
  resistor: { id: 'resistor', name: 'Điện trở', cat: 'passive', w: 70, h: 24,
    pins: [lp('p1', -35, 0, 'in'), lp('p2', 35, 0, 'out')], defaults: { value: '10k' } },
  capacitor: { id: 'capacitor', name: 'Tụ điện', cat: 'passive', w: 50, h: 30,
    pins: [lp('p1', -25, 0, 'in'), lp('p2', 25, 0, 'out')], defaults: { value: '100nF' } },
  inductor: { id: 'inductor', name: 'Cuộn cảm', cat: 'passive', w: 70, h: 28,
    pins: [lp('p1', -35, 0, 'in'), lp('p2', 35, 0, 'out')], defaults: { value: '10mH' } },

  /* ---------- SOURCE / POWER ---------- */
  vcc: { id: 'vcc', name: 'VCC (+5V)', cat: 'source', w: 34, h: 34,
    pins: [lp('out', 0, 17, 'out')] },
  gnd: { id: 'gnd', name: 'GND', cat: 'source', w: 34, h: 30,
    pins: [lp('out', 0, -15, 'out')] },
  battery: { id: 'battery', name: 'Pin', cat: 'source', w: 44, h: 44,
    pins: [lp('plus', 0, -22, 'out'), lp('minus', 0, 22, 'out')], defaults: { voltage: '9V' } },
  clock: { id: 'clock', name: 'Clock', cat: 'source', w: 52, h: 52, evaluable: true,
    pins: [lp('out', 26, 0, 'out', 'CLK')], defaults: { freqHz: 1 } },

  /* ---------- IO ---------- */
  switch: { id: 'switch', name: 'Công tắc', cat: 'io', w: 60, h: 30, evaluable: true,
    pins: [lp('in', -30, 0, 'in'), lp('out', 30, 0, 'out')], defaults: { on: false } },
  led: { id: 'led', name: 'LED', cat: 'io', w: 46, h: 46,
    pins: [lp('anode', -23, 0, 'in', 'A'), lp('cathode', 23, 0, 'in', 'K')],
    defaults: { color: '#ef4444' } },
  probe: { id: 'probe', name: 'Đo điểm', cat: 'probe', w: 40, h: 40,
    pins: [lp('in', -20, 0, 'in')] },

  /* ---------- LOGIC GATES (IEEE) ---------- */
  buf: { id: 'buf', name: 'Buffer', cat: 'logic', w: 64, h: 44, evaluable: true,
    pins: [lp('a', -32, 0, 'in', 'A'), lp('y', 32, 0, 'out', 'Y')] },
  not: { id: 'not', name: 'NOT', cat: 'logic', w: 68, h: 44, evaluable: true,
    pins: [lp('a', -34, 0, 'in', 'A'), lp('y', 34, 0, 'out', 'Y')] },
  and: { id: 'and', name: 'AND', cat: 'logic', w: 72, h: 52, evaluable: true,
    pins: [lp('a', -36, -13, 'in', 'A'), lp('b', -36, 13, 'in', 'B'), lp('y', 36, 0, 'out', 'Y')] },
  nand: { id: 'nand', name: 'NAND', cat: 'logic', w: 76, h: 52, evaluable: true,
    pins: [lp('a', -38, -13, 'in', 'A'), lp('b', -38, 13, 'in', 'B'), lp('y', 38, 0, 'out', 'Y')] },
  or: { id: 'or', name: 'OR', cat: 'logic', w: 72, h: 52, evaluable: true,
    pins: [lp('a', -36, -13, 'in', 'A'), lp('b', -36, 13, 'in', 'B'), lp('y', 36, 0, 'out', 'Y')] },
  nor: { id: 'nor', name: 'NOR', cat: 'logic', w: 76, h: 52, evaluable: true,
    pins: [lp('a', -38, -13, 'in', 'A'), lp('b', -38, 13, 'in', 'B'), lp('y', 38, 0, 'out', 'Y')] },
  xor: { id: 'xor', name: 'XOR', cat: 'logic', w: 78, h: 52, evaluable: true,
    pins: [lp('a', -39, -13, 'in', 'A'), lp('b', -39, 13, 'in', 'B'), lp('y', 39, 0, 'out', 'Y')] },
  xnor: { id: 'xnor', name: 'XNOR', cat: 'logic', w: 82, h: 52, evaluable: true,
    pins: [lp('a', -41, -13, 'in', 'A'), lp('b', -41, 13, 'in', 'B'), lp('y', 41, 0, 'out', 'Y')] },

  /* ---------- TRANSISTOR (visual) ---------- */
  npn: { id: 'npn', name: 'NPN', cat: 'transistor', w: 56, h: 56,
    pins: [lp('b', -28, 0, 'in', 'B'), lp('c', 14, -28, 'in', 'C'), lp('e', 14, 28, 'out', 'E')] },
};

const CAT_LABEL: Record<CompDef['cat'], string> = {
  passive: 'Linh kiện thụ động',
  source: 'Nguồn / Xung',
  io: 'Vào / Ra',
  logic: 'Cổng logic',
  probe: 'Thiết bị đo',
  transistor: 'Transistor',
};
const CAT_ORDER: CompDef['cat'][] = ['source', 'io', 'logic', 'passive', 'transistor', 'probe'];

/* ============================================================
   LOGIC SIMULATION ENGINE
============================================================ */
const pkey = (c: string, p: string) => `${c}::${p}`;

function evalGate(type: string, ins: LogicState[]): LogicState {
  const nTrue = ins.filter(Boolean).length;
  switch (type) {
    case 'and': return ins.length > 0 && nTrue === ins.length;
    case 'nand': return !(ins.length > 0 && nTrue === ins.length);
    case 'or': return nTrue > 0;
    case 'nor': return nTrue === 0;
    case 'not':
    case 'buf_invert_placeholder': return !ins[0];
    case 'buf': return !!ins[0];
    case 'xor': return nTrue % 2 === 1;
    case 'xnor': return nTrue % 2 === 0;
    default: return false;
  }
}

interface SimResult {
  pinVal: Record<string, LogicState>;
  netRoot: Record<string, LogicState>;
}

function simulate(comps: Comp[], wires: Wire[], tSec: number): SimResult {
  /* union-find nets */
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const c of comps) for (const p of DEFS[c.type]?.pins ?? []) {
    const k = pkey(c.id, p.id);
    parent.set(k, k);
  }
  for (const w of wires) {
    if (!parent.has(w.from) || !parent.has(w.to)) continue;
    const ra = find(w.from), rb = find(w.to);
    if (ra !== rb) parent.set(ra, rb);
  }

  const netVal = new Map<string, LogicState>();
  const read = (k: string) => netVal.get(find(k)) ?? false;
  const drive = (k: string, v: LogicState) => { netVal.set(find(k), v); };

  /* seed sources */
  for (const c of comps) {
    const d = DEFS[c.type];
    if (!d) continue;
    const outPin = d.pins.find((p) => p.dir === 'out');
    if (!outPin) continue;
    const k = pkey(c.id, outPin.id);
    switch (c.type) {
      case 'vcc': drive(k, true); break;
      case 'gnd': drive(k, false); break;
      case 'clock': {
        const f = Math.max(0.1, Number(c.props.freqHz) || 1);
        drive(k, Math.floor(tSec * f * 2) % 2 === 1);
        break;
      }
      case 'switch': drive(k, !!c.props.on); break;
    }
  }

  /* fixed-point gate propagation */
  const GATES = ['and', 'nand', 'or', 'nor', 'not', 'buf', 'xor', 'xnor'];
  const maxIter = comps.filter((c) => GATES.includes(c.type)).length + 2;
  for (let i = 0; i <= maxIter; i++) {
    let changed = false;
    for (const c of comps) {
      if (!GATES.includes(c.type)) continue;
      const d = DEFS[c.type];
      const ins = d.pins.flatMap((pin) => pin.dir === 'in' ? [read(pkey(c.id, pin.id))] : []);
      const out = evalGate(c.type, ins);
      const op = d.pins.find((p) => p.dir === 'out');
      if (!op) continue;
      const k = pkey(c.id, op.id);
      if ((netVal.get(find(k)) ?? false) !== out) { drive(k, out); changed = true; }
    }
    if (!changed) break;
  }

  const pinVal: Record<string, LogicState> = {};
  const netRoot: Record<string, LogicState> = {};
  for (const c of comps) for (const p of DEFS[c.type]?.pins ?? []) {
    const k = pkey(c.id, p.id);
    const v = read(k);
    pinVal[k] = v;
    netRoot[find(k)] = v;
  }
  return { pinVal, netRoot };
}

/* ============================================================
   GEOMETRY HELPERS
============================================================ */
const snap = (v: number) => Math.round(v / GRID) * GRID;

function pinWorldPos(c: Comp, pinId: string): Pt {
  const def = DEFS[c.type];
  const p = def?.pins.find((q) => q.id === pinId);
  if (!p) return { x: c.x, y: c.y };
  const a = (c.rot * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  return { x: c.x + p.x * cos - p.y * sin, y: c.y + p.x * sin + p.y * cos };
}

function orthPath(a: Pt, b: Pt): string {
  const mx = (a.x + b.x) / 2;
  return `M ${a.x} ${a.y} L ${mx} ${a.y} L ${mx} ${b.y} L ${b.x} ${b.y}`;
}

/* ============================================================
   SVG SYMBOL PAINTER  (returns elements in LOCAL coords)
============================================================ */
const S = '#1e293b';       // symbol stroke
const SW = 2;

function GateBody({ type, w, h }: { type: string; w: number; h: number }) {
  const hh = h / 2, ww = w / 2;
  const bubble = ['not', 'nand', 'nor', 'xnor'].includes(type);
  const br = 5;
  const bodyW = bubble ? ww - br : ww;

  let path = '';
  switch (type) {
    case 'and': case 'nand': {
      const fx = -ww + (bodyW - -ww) * 0.62;
      path = `M ${-ww} ${-hh} L ${fx} ${-hh} A ${hh} ${hh} 0 0 1 ${fx} ${hh} L ${-ww} ${hh} Z`;
      break;
    }
    case 'or': case 'nor': case 'xor': case 'xnor': {
      const bx = -ww + (bubble ? br : 0);
      path =
        `M ${bx} ${-hh}` +
        ` C ${ww * 0.25} ${-hh}, ${bodyW} ${-hh * 0.55}, ${bodyW} 0` +
        ` C ${bodyW} ${hh * 0.55}, ${ww * 0.25} ${hh}, ${bx} ${hh}` +
        ` Q ${bx + w * 0.22} 0, ${bx} ${-hh} Z`;
      break;
    }
    case 'not': {
      path = `M ${-ww} ${-hh} L ${bodyW} 0 L ${-ww} ${hh} Z`;
      break;
    }
    case 'buf': {
      path = `M ${-ww} ${-hh} L ${ww} 0 L ${-ww} ${hh} Z`;
      break;
    }
  }
  return (
    <>
      <path d={path} fill="#f8fafc" stroke={S} strokeWidth={SW} strokeLinejoin="round" />
      {bubble && <circle cx={bodyW + br} cy={0} r={br} fill="#f8fafc" stroke={S} strokeWidth={SW} />}
      {(type === 'xor' || type === 'xnor') && (
        <path
          d={`M ${-ww - 6 + (bubble ? br : 0)} ${-hh} Q ${-ww + 14 + (bubble ? br : 0)} 0, ${-ww - 6 + (bubble ? br : 0)} ${hh}`}
          fill="none" stroke={S} strokeWidth={SW}
        />
      )}
    </>
  );
}

function SymbolBody({ comp }: { comp: Comp }) {
  const def = DEFS[comp.type];
  if (!def) return null;
  const w = def.w, h = def.h;
  const val = String(comp.props.value ?? '');

  switch (comp.type) {
    /* ---- PASSIVE ---- */
    case 'resistor':
      return (
        <>
          <line x1={-w / 2} y1={0} x2={-w * 0.3} y2={0} stroke={S} strokeWidth={SW} />
          <rect x={-w * 0.3} y={-11} width={w * 0.6} height={22} rx={2}
            fill="#fff" stroke={S} strokeWidth={SW} />
          <line x1={w * 0.3} y1={0} x2={w / 2} y2={0} stroke={S} strokeWidth={SW} />
          {val && <text y={-16} textAnchor="middle" fontSize={10} fill="#475569">{val}</text>}
        </>
      );
    case 'capacitor':
      return (
        <>
          <line x1={-w / 2} y1={0} x2={-5} y2={0} stroke={S} strokeWidth={SW} />
          <line x1={-5} y1={-14} x2={-5} y2={14} stroke={S} strokeWidth={SW + 0.5} />
          <line x1={5} y1={-14} x2={5} y2={14} stroke={S} strokeWidth={SW + 0.5} />
          <line x1={5} y1={0} x2={w / 2} y2={0} stroke={S} strokeWidth={SW} />
          {val && <text y={-20} textAnchor="middle" fontSize={10} fill="#475569">{val}</text>}
        </>
      );
    case 'inductor': {
      const r = 7, n = 4, startX = -(n * r);
      const arcs = [];
      for (let i = 0; i < n; i++) {
        arcs.push(
          <path key={i} d={`M ${startX + i * 2 * r} 0 A ${r} ${r} 0 0 1 ${startX + (i + 1) * 2 * r} 0`}
            fill="none" stroke={S} strokeWidth={SW} />
        );
      }
      return (
        <>
          <line x1={-w / 2} y1={0} x2={startX} y2={0} stroke={S} strokeWidth={SW} />
          {arcs}
          <line x1={-startX} y1={0} x2={w / 2} y2={0} stroke={S} strokeWidth={SW} />
          {val && <text y={-18} textAnchor="middle" fontSize={10} fill="#475569">{val}</text>}
        </>
      );
    }

    /* ---- POWER ---- */
    case 'vcc':
      return (
        <>
          <line x1={0} y1={h / 2} x2={0} y2={-6} stroke={S} strokeWidth={SW} />
          <line x1={-12} y1={-6} x2={12} y2={-6} stroke={S} strokeWidth={SW + 1} />
          <text y={-12} textAnchor="middle" fontSize={10} fontWeight={700} fill="#dc2626">VCC</text>
        </>
      );
    case 'gnd':
      return (
        <>
          <line x1={0} y1={-h / 2} x2={0} y2={2} stroke={S} strokeWidth={SW} />
          <line x1={-12} y1={2} x2={12} y2={2} stroke={S} strokeWidth={SW + 0.5} />
          <line x1={-8} y1={7} x2={8} y2={7} stroke={S} strokeWidth={SW} />
          <line x1={-4} y1={12} x2={4} y2={12} stroke={S} strokeWidth={SW} />
        </>
      );
    case 'battery': {
      const v = String(comp.props.voltage ?? '');
      return (
        <>
          <line x1={0} y1={-h / 2} x2={0} y2={-14} stroke={S} strokeWidth={SW} />
          <line x1={-12} y1={-14} x2={12} y2={-14} stroke={S} strokeWidth={SW + 1} />
          <line x1={-6} y1={-8} x2={6} y2={-8} stroke={S} strokeWidth={SW + 1} />
          <line x1={-12} y1={-2} x2={12} y2={-2} stroke={S} strokeWidth={SW + 1} />
          <line x1={-6} y1={4} x2={6} y2={4} stroke={S} strokeWidth={SW + 1} />
          <line x1={0} y1={4} x2={0} y2={h / 2} stroke={S} strokeWidth={SW} />
          <text x={16} y={-10} fontSize={10} fontWeight={700} fill="#dc2626">+</text>
          <text x={16} y={10} fontSize={10} fontWeight={700} fill="#334155">−</text>
          {v && <text x={0} y={h / 2 + 12} textAnchor="middle" fontSize={10} fill="#475569">{v}</text>}
        </>
      );
    }
    case 'clock':
      return (
        <>
          <circle r={h / 2} fill="#eff6ff" stroke={S} strokeWidth={SW} />
          <path d="M -14 6 L -14 -6 L -4 -6 L -4 6 L 6 6 L 6 -6 L 14 -6"
            fill="none" stroke="#2563eb" strokeWidth={2} />
          <text y={h / 2 + 12} textAnchor="middle" fontSize={9} fill="#475569">
            {Number(comp.props.freqHz ?? 1)} Hz
          </text>
        </>
      );

    /* ---- IO ---- */
    case 'switch': {
      const on = !!comp.props.on;
      return (
        <>
          <circle cx={-w / 2 + 4} cy={0} r={3} fill={S} />
          <circle cx={w / 2 - 4} cy={0} r={3} fill={on ? '#22c55e' : S} />
          <line x1={-w / 2 + 4} y1={0}
            x2={on ? w / 2 - 4 : w / 2 - 14} y2={on ? 0 : -14}
            stroke={on ? '#16a34a' : S} strokeWidth={SW} />
          {!on && <circle cx={w / 2 - 14} cy={-14} r={2.5} fill={S} />}
          <text y={-20} textAnchor="middle" fontSize={9} fontWeight={700}
            fill={on ? '#16a34a' : '#94a3b8'}>{on ? 'ON' : 'OFF'}</text>
        </>
      );
    }
    case 'led': {
      const lit = comp.props._lit === true;
      const col = String(comp.props.color ?? '#ef4444');
      return (
        <>
          <circle r={h / 2 - 2} cx={0} cy={0}
            fill={lit ? col : '#f1f5f9'}
            stroke={lit ? col : S} strokeWidth={SW}
            filter={lit ? 'url(#glow)' : undefined} opacity={lit ? 0.95 : 1} />
          <path d={`M ${-7} ${-9} L ${-7} ${9} L ${8} 0 Z`} fill={lit ? '#fff' : S} opacity={lit ? 0.85 : 0.9} />
          <line x1={8} y1={-9} x2={8} y2={9} stroke={lit ? '#fff' : S} strokeWidth={SW} />
        </>
      );
    }
    case 'probe': {
      const hi = comp.props._lit === true;
      return (
        <>
          <circle r={14} fill={hi ? '#ecfdf5' : '#f8fafc'} stroke={hi ? '#10b981' : S} strokeWidth={SW} />
          <text textAnchor="middle" y={4} fontSize={12} fontWeight={800}
            fill={hi ? '#059669' : '#64748b'}>V</text>
          <text y={-20} textAnchor="middle" fontSize={10} fontWeight={800}
            fill={hi ? '#059669' : '#94a3b8'}>{hi ? 'HIGH' : 'LOW'}</text>
        </>
      );
    }

    /* ---- LOGIC ---- */
    case 'and': case 'nand': case 'or': case 'nor':
    case 'xor': case 'xnor': case 'not': case 'buf':
      return <GateBody type={comp.type} w={def.w} h={def.h} />;

    /* ---- NPN (visual) ---- */
    case 'npn':
      return (
        <>
          <circle r={h / 2 - 2} fill="none" stroke={S} strokeWidth={1.2} />
          <line x1={-w / 2 + 4} y1={0} x2={-6} y2={0} stroke={S} strokeWidth={SW} />
          <line x1={-6} y1={-12} x2={-6} y2={12} stroke={S} strokeWidth={SW + 1} />
          <line x1={-6} y1={0} x2={12} y2={-14} stroke={S} strokeWidth={SW} />
          <polygon points="12,-14 4,-13 9,-19" fill={S} />
          <line x1={-6} y1={0} x2={12} y2={14} stroke={S} strokeWidth={SW} />
          <line x1={12} y1={-14} x2={12} y2={-h / 2 + 2} stroke={S} strokeWidth={SW} />
          <line x1={12} y1={14} x2={12} y2={h / 2 - 2} stroke={S} strokeWidth={SW} />
        </>
      );

    default:
      return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={4} fill="#fee2e2" stroke="#ef4444" />;
  }
}

/* ============================================================
   MEMOIZED SUB-COMPONENTS
============================================================ */
const CompNode = memo(function CompNode({
  comp, selected, lit, dragging, onPointerDownComp, onPointerDownPin,
}: {
  comp: Comp;
  selected: boolean;
  lit: boolean;
  dragging: boolean;
  onPointerDownComp: (e: React.PointerEvent, id: string) => void;
  onPointerDownPin: (e: React.PointerEvent, compId: string, pinId: string, pin: PinDef) => void;
}) {
  const def = DEFS[comp.type];
  if (!def) return null;
  const shown = { ...comp, props: { ...comp.props, _lit: lit } };

  return (
    <g transform={`translate(${comp.x},${comp.y}) rotate(${comp.rot})`}
      onPointerDown={(e) => onPointerDownComp(e, comp.id)}
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
    >
      <SymbolBody comp={shown} />

      {/* pins */}
      {def.pins.map((p) => (
        <g key={p.id}>
          <circle cx={p.x} cy={p.y} r={PIN_R}
            fill={p.dir === 'out' ? '#2563eb' : '#dc2626'}
            stroke="#fff" strokeWidth={1.2} />
          <circle cx={p.x} cy={p.y} r={PIN_R + 4} fill="transparent"
            style={{ cursor: 'crosshair' }}
            onPointerDown={(e) => { e.stopPropagation(); onPointerDownPin(e, comp.id, p.id, p); }} />
          {p.label && (
            <text x={p.x + (p.x >= 0 ? 8 : -8)} y={p.y - 6} textAnchor={p.x >= 0 ? 'start' : 'end'}
              fontSize={9} fontWeight={700} fill="#64748b" pointerEvents="none">
              {p.label}
            </text>
          )}
        </g>
      ))}

      {/* selection */}
      {selected && (
        <rect x={-def.w / 2 - 6} y={-def.h / 2 - 6}
          width={def.w + 12} height={def.h + 12} rx={6}
          fill="none" stroke="#2563eb" strokeWidth={1.6} strokeDasharray="5 3"
          pointerEvents="none" />
      )}
    </g>
  );
});

const WireLink = memo(function WireLink({
  wireId, d, state, running, hitD, onErase,
}: {
  wireId: string;
  d: string; state: 'high' | 'low' | 'float'; running: boolean;
  hitD: string; onErase: (wireId: string) => void;
}) {
  const color = state === 'high' ? '#16a34a' : state === 'low' ? '#334155' : '#94a3b8';
  return (
    <g>
      <path d={hitD} stroke="transparent" strokeWidth={12} fill="none"
        style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); onErase(wireId); }} />
      <path d={d} stroke={color} strokeWidth={state === 'high' && running ? 3 : 2.4}
        fill="none" strokeLinejoin="round"
        className={state === 'high' && running ? 'wire-flow' : undefined}
        filter={state === 'high' ? 'url(#glow)' : undefined} />
    </g>
  );
});

/* ============================================================
   OSCILLOSCOPE
============================================================ */
const CH_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706'];
const SCOPE_W = 300, SCOPE_H = 120, SAMPLES = 220;

function ScopeView({ sample, running }: { sample: () => LogicState[]; running: boolean }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const hist = useRef<boolean[][]>([]);
  const raf = useRef<number>(0);

  useEffect(() => {
    if (!running) { if (raf.current) cancelAnimationFrame(raf.current); draw(); return; }
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 40) {
        last = now;
        const s = sample();
        s.forEach((v, i) => {
          if (!hist.current[i]) hist.current[i] = [];
          hist.current[i].push(v);
          if (hist.current[i]!.length > SAMPLES) hist.current[i]!.shift();
        });
        draw();
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, sample]);

  function draw() {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, SCOPE_W, SCOPE_H);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, SCOPE_W, SCOPE_H);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= SCOPE_W; gx += 30) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, SCOPE_H); ctx.stroke();
    }
    for (let gy = 0; gy <= SCOPE_H; gy += 30) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(SCOPE_W, gy); ctx.stroke();
    }
    const chs = Math.max(hist.current.length, 1);
    hist.current.forEach((arr, ci) => {
      ctx.strokeStyle = CH_COLORS[ci % CH_COLORS.length];
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      const step = SCOPE_W / SAMPLES;
      const bandH = SCOPE_H / chs;
      arr.forEach((v, i) => {
        const y = bandH * ci + bandH * (v ? 0.22 : 0.78);
        if (i === 0) ctx.moveTo(i * step, y);
        else ctx.lineTo(i * step, y);
      });
      ctx.stroke();
    });
  }

  return (
    <div className="rounded-sm border border-slate-700 bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 bg-slate-800">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
          Oscilloscope
        </span>
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].slice(0, hist.current.length || 0).map((i) => (
            <span key={i} className="flex items-center gap-0.5 text-[8px] font-mono"
              style={{ color: CH_COLORS[i % CH_COLORS.length] }}>
              <span className="inline-block w-2 h-0.5" style={{ background: CH_COLORS[i % CH_COLORS.length] }} />
              CH{i + 1}
            </span>
          ))}
        </div>
      </div>
      <canvas ref={cvRef} width={SCOPE_W} height={SCOPE_H} className="block" />
    </div>
  );
}

/* ============================================================
   MAIN COMPONENT
============================================================ */
function useCircuitEditor({
  gameType, initialData, onChange,
}: Props) {
  const isSim = gameType === 'circuit_simulate';

  const [comps, setComps] = useState<Comp[]>(initialData?.components ?? []);
  const [wires, setWires] = useState<Wire[]>(initialData?.wires ?? []);
  const [selId, setSelId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('select');

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });

  const [wireFrom, setWireFrom] = useState<{ compId: string; pin: PinDef } | null>(null);
  const [cursorPt, setCursorPt] = useState<Pt | null>(null);

  const [running, setRunning] = useState(isSim);
  const [speed, setSpeed] = useState(1);
  const [simTime, setSimTime] = useState(0);

  const svgWrap = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const panRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  /* -------- event-driven data publication -------- */
  const dataRef = useRef({ comps, wires });

  const applyData = useCallback((next: { comps: Comp[]; wires: Wire[] }, notify = true) => {
    dataRef.current = next;
    setComps(next.comps);
    setWires(next.wires);
    if (notify) onChange?.({ components: next.comps, wires: next.wires });
  }, [onChange]);

  const updateComps = useCallback((update: Comp[] | ((current: Comp[]) => Comp[]), notify = true) => {
    const current = dataRef.current;
    const nextComps = typeof update === 'function' ? update(current.comps) : update;
    applyData({ comps: nextComps, wires: current.wires }, notify);
  }, [applyData]);

  const updateWires = useCallback((update: Wire[] | ((current: Wire[]) => Wire[]), notify = true) => {
    const current = dataRef.current;
    const nextWires = typeof update === 'function' ? update(current.wires) : update;
    applyData({ comps: current.comps, wires: nextWires }, notify);
  }, [applyData]);

  /* -------- sim clock -------- */
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = ((now - last) / 1000) * speed;
      last = now;
      setSimTime((t) => t + dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, speed]);

  const sim = useMemo(() => simulate(comps, wires, simTime), [comps, wires, simTime]);
  const simRef = useRef(sim);
  useEffect(() => { simRef.current = sim; }, [sim]);

  /* -------- helpers -------- */
  const toWorld = useCallback((cx: number, cy: number): Pt => {
    const el = svgWrap.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: (cx - r.left - pan.x) / zoom, y: (cy - r.top - pan.y) / zoom };
  }, [pan, zoom]);

  const wireStateOf = useCallback((w: Wire): 'high' | 'low' | 'float' => {
    const root = Object.keys(sim.netRoot).length ? undefined : undefined;
    void root;
    const vA = sim.pinVal[w.from];
    if (vA === true) return 'high';
    if (vA === false) return 'low';
    const vB = sim.pinVal[w.to];
    if (vB === true) return 'high';
    if (vB === false) return 'low';
    return 'float';
  }, [sim]);

  const compLit = useCallback((c: Comp): boolean => {
    const def = DEFS[c.type];
    if (!def) return false;
    if (c.type === 'led') {
      const a = def.pins.find((p) => p.id === 'anode');
      const k = def.pins.find((p) => p.id === 'cathode');
      if (!a || !k) return false;
      return sim.pinVal[pkey(c.id, a.id)] === true && sim.pinVal[pkey(c.id, k.id)] === false;
    }
    const inp = def.pins.find((p) => p.dir === 'in');
    if (!inp) return false;
    return sim.pinVal[pkey(c.id, inp.id)] === true;
  }, [sim]);

  /* -------- mutations -------- */
  const commit = useCallback(() => {
    onChange?.({ components: dataRef.current.comps, wires: dataRef.current.wires });
  }, [onChange]);

  const addComp = useCallback((type: string) => {
    const def = DEFS[type];
    if (!def) return;
    const c: Comp = {
      id: `c${Date.now()}${Math.floor(Math.random() * 1e4)}`,
      type,
      x: snap(200 + Math.random() * 160),
      y: snap(160 + Math.random() * 120),
      rot: 0,
      props: { ...(def.defaults ?? {}) },
    };
    updateComps((prev) => [...prev, c]);
    setSelId(c.id);
    toast.success(`Đã thêm ${def.name}`);
  }, [updateComps]);

  const removeComp = useCallback((id: string) => {
    const current = dataRef.current;
    applyData({
      comps: current.comps.filter((c) => c.id !== id),
      wires: current.wires.filter((w) => !w.from.startsWith(id + '::') && !w.to.startsWith(id + '::')),
    });
    if (selId === id) setSelId(null);
  }, [applyData, selId]);

  const rotateSel = useCallback(() => {
    if (!selId) return;
    updateComps((prev) => prev.map((c) => (c.id === selId ? { ...c, rot: (c.rot + 90) % 360 } : c)));
  }, [selId, updateComps]);

  const eraseWire = useCallback((id: string) => {
    updateWires((prev) => prev.filter((w) => w.id !== id));
  }, [updateWires]);

  /* -------- pointer handling -------- */
  const onBgPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && mode === 'select' && !wireFrom)) {
      panRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    }
    if (mode !== 'wire') setSelId(null);
    if (wireFrom && mode === 'wire') setWireFrom(null);
  }, [mode, pan, wireFrom]);

  const onCompPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    if (mode === 'erase') { removeComp(id); return; }
    if (mode !== 'select') return;
    e.stopPropagation();
    setSelId(id);
    const p = toWorld(e.clientX, e.clientY);
    const c = comps.find((x) => x.id === id);
    if (c) dragRef.current = { id, dx: c.x - p.x, dy: c.y - p.y };
  }, [mode, comps, toWorld, removeComp]);

  const onPinPointerDown = useCallback((e: React.PointerEvent, compId: string, pinId: string, pin: PinDef) => {
    if (mode !== 'wire') return;
    e.stopPropagation();
    if (!wireFrom) {
      setWireFrom({ compId, pin });
    } else {
      const aKey = pkey(wireFrom.compId, wireFrom.pin.id);
      const bKey = pkey(compId, pinId);
      if (aKey === bKey) { setWireFrom(null); return; }
      if (wireFrom.pin.dir === 'out' && pin.dir === 'in') {
        const w: Wire = { id: `w${Date.now()}${Math.floor(Math.random() * 1e4)}`, from: aKey, to: bKey };
        updateWires((prev) => [...prev, w]);
      } else if (wireFrom.pin.dir === 'in' && pin.dir === 'out') {
        const w: Wire = { id: `w${Date.now()}${Math.floor(Math.random() * 1e4)}`, from: bKey, to: aKey };
        updateWires((prev) => [...prev, w]);
      } else {
        toast.error('Nối chân OUT → chân IN');
        setWireFrom(null);
        return;
      }
      setWireFrom(null);
    }
  }, [mode, updateWires, wireFrom]);

  const onMove = useCallback((e: React.PointerEvent) => {
    const wp = toWorld(e.clientX, e.clientY);
    if (dragRef.current) {
      const { id, dx, dy } = dragRef.current;
      updateComps((prev) => prev.map((c) =>
        c.id === id ? { ...c, x: snap(wp.x + dx), y: snap(wp.y + dy) } : c), false);
      return;
    }
    if (panRef.current) {
      const { sx, sy, px, py } = panRef.current;
      setPan({ x: px + (e.clientX - sx), y: py + (e.clientY - sy) });
      return;
    }
    if (wireFrom && mode === 'wire') setCursorPt({ x: snap(wp.x), y: snap(wp.y) });
  }, [toWorld, updateComps, wireFrom, mode]);

  const onUp = useCallback(() => {
    if (dragRef.current) { dragRef.current = null; commit(); }
    panRef.current = null;
  }, [commit]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      setZoom((z) => Math.min(2.2, Math.max(0.4, z - e.deltaY * 0.0015)));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  }, []);

  /* -------- keyboard -------- */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selId) { removeComp(selId); e.preventDefault(); }
      } else if (e.key === 'r' || e.key === 'R') {
        rotateSel();
      } else if (e.key === 'Escape') {
        setWireFrom(null); setMode('select');
      } else if (e.key === 'w' || e.key === 'W') {
        setMode('wire');
      } else if (e.key === 'v' || e.key === 'V') {
        setMode('select');
      } else if (e.key === 'e' || e.key === 'E') {
        setMode('erase');
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selId, removeComp, rotateSel]);

  /* -------- click switch toggles -------- */
  const toggleSwitch = useCallback((id: string) => {
    updateComps((prev) => prev.map((c) =>
      c.id === id ? { ...c, props: { ...c.props, on: !c.props.on } } : c));
  }, [updateComps]);

  /* double-click handler routed through overlay */
  const onBgDoubleClick = useCallback((e: React.MouseEvent) => {
    const wp = toWorld(e.clientX, e.clientY);
    const hit = comps.find((c) => {
      const def = DEFS[c.type];
      if (!def) return false;
      return Math.abs(wp.x - c.x) < def.w / 2 + 4 && Math.abs(wp.y - c.y) < def.h / 2 + 4;
    });
    if (hit?.type === 'switch') toggleSwitch(hit.id);
  }, [comps, toWorld, toggleSwitch]);

  /* -------- scope sampling -------- */
  const scopeSample = useCallback((): LogicState[] => {
    const chans: LogicState[] = [];
    for (const c of dataRef.current.comps) {
      if (chans.length >= 4) break;
      const def = DEFS[c.type];
      if (!def) continue;
      if (c.type === 'clock') {
        const p = def.pins[0];
        chans.push(simRef.current.pinVal[pkey(c.id, p.id)] ?? false);
      } else if (c.type === 'led' || c.type === 'probe') {
        chans.push(compLit(c));
      }
    }
    while (chans.length < 1) chans.push(false);
    return chans;
  }, [compLit]);

  const selComp = comps.find((c) => c.id === selId) ?? null;

  return {
    isSim,
    mode,
    setMode,
    addComp,
    selComp,
    updateComps,
    rotateSel,
    selId,
    removeComp,
    comps,
    wires,
    running,
    setRunning,
    setSimTime,
    speed,
    setSpeed,
    simTime,
    zoom,
    setZoom,
    pan,
    setPan,
    wireFrom,
    cursorPt,
    svgWrap,
    onBgPointerDown,
    onMove,
    onUp,
    onWheel,
    onBgDoubleClick,
    wireStateOf,
    eraseWire,
    dragRef,
    onCompPointerDown,
    onPinPointerDown,
    compLit,
    scopeSample,
  };
}

export default function CircuitCanvas(props: Props) {
  const editor = useCircuitEditor(props);

  return (
    <div className="flex h-full min-h-[520px] w-full overflow-hidden rounded-sm border border-slate-200 bg-white">
      <style>{`
        @keyframes flowdash { to { stroke-dashoffset: -28; } }
        .wire-flow { stroke-dasharray: 10 4; animation: flowdash .6s linear infinite; cursor: pointer; }
      `}</style>

      <CircuitPalette
        mode={editor.mode}
        setMode={editor.setMode}
        addComp={editor.addComp}
        selectedComp={editor.selComp}
        updateComps={editor.updateComps}
        rotateSelected={editor.rotateSel}
        selectedId={editor.selId}
        removeComp={editor.removeComp}
        isSimulation={editor.isSim}
        onSubmitCircuit={props.onSubmitCircuit}
        comps={editor.comps}
        wires={editor.wires}
      />
      <CircuitWorkspace
        isSimulation={editor.isSim}
        running={editor.running}
        setRunning={editor.setRunning}
        setSimTime={editor.setSimTime}
        speed={editor.speed}
        setSpeed={editor.setSpeed}
        simTime={editor.simTime}
        mode={editor.mode}
        zoom={editor.zoom}
        setZoom={editor.setZoom}
        pan={editor.pan}
        setPan={editor.setPan}
        wireFrom={editor.wireFrom}
        cursorPt={editor.cursorPt}
        svgWrap={editor.svgWrap}
        onBgPointerDown={editor.onBgPointerDown}
        onMove={editor.onMove}
        onUp={editor.onUp}
        onWheel={editor.onWheel}
        onBgDoubleClick={editor.onBgDoubleClick}
        wires={editor.wires}
        comps={editor.comps}
        wireStateOf={editor.wireStateOf}
        eraseWire={editor.eraseWire}
        selectedId={editor.selId}
        dragRef={editor.dragRef}
        onCompPointerDown={editor.onCompPointerDown}
        onPinPointerDown={editor.onPinPointerDown}
        compLit={editor.compLit}
        scopeSample={editor.scopeSample}
      />
    </div>
  );
}

function CircuitPalette({
  mode,
  setMode,
  addComp,
  selectedComp,
  updateComps,
  rotateSelected,
  selectedId,
  removeComp,
  isSimulation,
  onSubmitCircuit,
  comps,
  wires,
}: {
  mode: EditorMode;
  setMode: React.Dispatch<React.SetStateAction<EditorMode>>;
  addComp: (type: string) => void;
  selectedComp: Comp | null;
  updateComps: (update: Comp[] | ((current: Comp[]) => Comp[]), notify?: boolean) => void;
  rotateSelected: () => void;
  selectedId: string | null;
  removeComp: (id: string) => void;
  isSimulation: boolean;
  onSubmitCircuit?: (data: CircuitData) => void;
  comps: Comp[];
  wires: Wire[];
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-3 py-2">
        <div className="grid grid-cols-3 gap-1">
          {([['select', 'Chọn', 'V'], ['wire', 'Nối', 'W'], ['erase', 'Xóa', 'E']] as const).map(([nextMode, label, hotkey]) => (
            <button key={nextMode} onClick={() => setMode(nextMode)} className={`rounded-sm px-1 py-1.5 text-[10px] font-bold uppercase tracking-wider transition ${mode === nextMode ? 'bg-blue-900 text-white shadow-sm' : 'bg-white text-slate-500 hover:bg-slate-100'}`}>
              {label}<span className="ml-1 opacity-50">{hotkey}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5">
        {CAT_ORDER.map((category) => {
          const items = Object.values(DEFS).filter((definition) => definition.cat === category);
          if (!items.length) return null;
          return (
            <div key={category}>
              <div className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{CAT_LABEL[category]}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map((definition) => (
                  <button key={definition.id} onClick={() => addComp(definition.id)} title={`${definition.name} — nhấn để thêm`} className="group flex flex-col items-center gap-0.5 rounded-sm border border-slate-200 bg-white px-1 pb-1 pt-2 transition hover:border-blue-300 hover:bg-blue-50">
                    <svg viewBox="-32 -32 64 64" width={44} height={36}>
                      <g transform="scale(0.62)"><SymbolBody comp={{ id: '', type: definition.id, x: 0, y: 0, rot: 0, props: { ...(definition.defaults ?? {}) } }} /></g>
                    </svg>
                    <span className="w-full truncate text-center text-[9px] font-semibold text-slate-600 group-hover:text-blue-900">{definition.name}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-1.5 border-t border-slate-200 p-2.5">
        {selectedComp && (
          <div className="mb-1 rounded-sm bg-blue-50 px-2 py-1.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-blue-900">{DEFS[selectedComp.type]?.name}</div>
            <PropEditor comp={selectedComp} onChange={(props) => updateComps((current) => current.map((component) => component.id === selectedComp.id ? { ...component, props } : component))} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-1">
          <button onClick={rotateSelected} disabled={!selectedId} className="rounded-sm border border-slate-300 bg-white py-1.5 text-[10px] font-bold uppercase text-slate-600 transition hover:bg-slate-100 disabled:opacity-40">Xoay ⟳</button>
          <button onClick={() => selectedId && removeComp(selectedId)} disabled={!selectedId} className="rounded-sm border border-red-200 bg-white py-1.5 text-[10px] font-bold uppercase text-red-600 transition hover:bg-red-50 disabled:opacity-40">Xóa Del</button>
        </div>
        {isSimulation && onSubmitCircuit && (
          <button onClick={() => onSubmitCircuit({ components: comps, wires })} className="w-full rounded-sm bg-blue-900 py-2 text-[11px] font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-slate-800">Nộp mạch</button>
        )}
      </div>
    </aside>
  );
}

interface CircuitWorkspaceProps {
  isSimulation: boolean;
  running: boolean;
  setRunning: React.Dispatch<React.SetStateAction<boolean>>;
  setSimTime: React.Dispatch<React.SetStateAction<number>>;
  speed: number;
  setSpeed: React.Dispatch<React.SetStateAction<number>>;
  simTime: number;
  mode: EditorMode;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: Pt;
  setPan: React.Dispatch<React.SetStateAction<Pt>>;
  wireFrom: { compId: string; pin: PinDef } | null;
  cursorPt: Pt | null;
  svgWrap: React.RefObject<HTMLDivElement | null>;
  onBgPointerDown: (event: React.PointerEvent) => void;
  onMove: (event: React.PointerEvent) => void;
  onUp: () => void;
  onWheel: (event: React.WheelEvent) => void;
  onBgDoubleClick: (event: React.MouseEvent) => void;
  wires: Wire[];
  comps: Comp[];
  wireStateOf: (wire: Wire) => 'high' | 'low' | 'float';
  eraseWire: (wireId: string) => void;
  selectedId: string | null;
  dragRef: React.RefObject<{ id: string; dx: number; dy: number } | null>;
  onCompPointerDown: (event: React.PointerEvent, id: string) => void;
  onPinPointerDown: (event: React.PointerEvent, compId: string, pinId: string, pin: PinDef) => void;
  compLit: (comp: Comp) => boolean;
  scopeSample: () => LogicState[];
}

function CircuitWorkspace(props: CircuitWorkspaceProps) {
  const {
    isSimulation, running, setRunning, setSimTime, speed, setSpeed, simTime, mode,
    zoom, setZoom, pan, setPan, wireFrom, cursorPt, svgWrap, onBgPointerDown,
    onMove, onUp, onWheel, onBgDoubleClick, wires, comps, wireStateOf, eraseWire,
    selectedId, dragRef, onCompPointerDown, onPinPointerDown, compLit, scopeSample,
  } = props;
  return (
    <div className="relative min-w-0 flex-1">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2.5">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-sm border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-sm backdrop-blur">
          {isSimulation ? (
            <>
              <button onClick={() => setRunning((value) => !value)} className={`rounded-sm px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition ${running ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white'}`}>{running ? '❚❚ Dừng' : '▶ Chạy'}</button>
              <button onClick={() => setSimTime(0)} className="rounded-sm border border-slate-300 px-2 py-1 text-[10px] font-bold uppercase text-slate-600 hover:bg-slate-50">↲ Reset</button>
              <select aria-label="Tốc độ mô phỏng" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="rounded-sm border border-slate-300 bg-white px-1 py-1 text-[10px] font-semibold text-slate-600">
                {[0.25, 0.5, 1, 2, 4].map((value) => <option key={value} value={value}>×{value}</option>)}
              </select>
              <span className="ml-1 font-mono text-[10px] text-slate-400">t={simTime.toFixed(1)}s</span>
            </>
          ) : <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Chế độ: {mode === 'select' ? 'Chọn / kéo thả' : mode === 'wire' ? 'Nối dây OUT→IN' : 'Xóa phần tử'}</span>}
        </div>
        <div className="pointer-events-auto flex items-center gap-1 rounded-sm border border-slate-200 bg-white/95 px-1 py-1 shadow-sm backdrop-blur">
          <button aria-label="Phóng to sơ đồ" onClick={() => setZoom((value) => Math.min(2.2, value + 0.2))} className="px-1.5 text-sm leading-none text-slate-600 hover:text-blue-900">+</button>
          <span className="w-9 text-center font-mono text-[10px] text-slate-500">{Math.round(zoom * 100)}%</span>
          <button aria-label="Thu nhỏ sơ đồ" onClick={() => setZoom((value) => Math.max(0.4, value - 0.2))} className="px-1.5 text-sm leading-none text-slate-600 hover:text-blue-900">−</button>
          <button aria-label="Đặt lại góc nhìn sơ đồ" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="px-1.5 text-xs text-slate-600 hover:text-blue-900">⌂</button>
        </div>
      </div>
      {mode === 'wire' && (
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[10px] font-semibold text-blue-900 shadow-sm">
          {wireFrom ? '→ Click chân IN của linh kiện khác để hoàn tất' : 'Click chân OUT (xanh dương) để bắt đầu'}
        </div>
      )}
      <div
        ref={svgWrap}
        className="absolute inset-0 touch-none select-none"
        style={{ cursor: mode === 'erase' ? 'crosshair' : 'default' }}
        onPointerDown={onBgPointerDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onWheel={onWheel}
        onDoubleClick={onBgDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
      >
        <svg width="100%" height="100%">
          <defs>
            <pattern id="gridSm" width={GRID / 2} height={GRID / 2} patternUnits="userSpaceOnUse"><path d={`M ${GRID / 2} 0 H 0 V ${GRID / 2}`} fill="none" stroke="#f1f5f9" strokeWidth="0.6" /></pattern>
            <pattern id="gridLg" width={GRID} height={GRID} patternUnits="userSpaceOnUse"><rect width={GRID} height={GRID} fill="url(#gridSm)" /><path d={`M ${GRID} 0 H 0 V ${GRID}`} fill="none" stroke="#e2e8f0" strokeWidth="0.8" /></pattern>
            <filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            <rect x={-4000} y={-4000} width={8000} height={8000} fill="url(#gridLg)" />
            <line x1={-4000} y1={0} x2={4000} y2={0} stroke="#cbd5e1" strokeWidth={1 / zoom} />
            <line x1={0} y1={-4000} x2={0} y2={4000} stroke="#cbd5e1" strokeWidth={1 / zoom} />
            {wires.map((wire) => {
              const [fromComponentId, fromPin] = wire.from.split('::');
              const [toComponentId, toPin] = wire.to.split('::');
              const fromComponent = comps.find((component) => component.id === fromComponentId);
              const toComponent = comps.find((component) => component.id === toComponentId);
              if (!fromComponent || !toComponent) return null;
              const from = pinWorldPos(fromComponent, fromPin);
              const to = pinWorldPos(toComponent, toPin);
              const path = orthPath(from, to);
              return <WireLink key={wire.id} wireId={wire.id} d={path} hitD={path} state={wireStateOf(wire)} running={running} onErase={eraseWire} />;
            })}
            {wires.map((wire) => {
              const [componentId, pinId] = wire.from.split('::');
              const component = comps.find((item) => item.id === componentId);
              if (!component) return null;
              const point = pinWorldPos(component, pinId);
              const state = wireStateOf(wire);
              return <circle key={`junction-${wire.id}`} cx={point.x} cy={point.y} r={2.6} fill={state === 'high' ? '#16a34a' : state === 'low' ? '#334155' : '#94a3b8'} pointerEvents="none" />;
            })}
            {wireFrom && (() => {
              const component = comps.find((item) => item.id === wireFrom.compId);
              if (!component) return null;
              const from = pinWorldPos(component, wireFrom.pin.id);
              return cursorPt
                ? <path d={orthPath(from, cursorPt)} stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 4" fill="none" pointerEvents="none" />
                : <circle cx={from.x} cy={from.y} r={5} fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="3 3" pointerEvents="none" />;
            })()}
            {comps.map((component) => (
              <CompNode key={component.id} comp={component} selected={selectedId === component.id} lit={compLit(component)} dragging={dragRef.current?.id === component.id} onPointerDownComp={onCompPointerDown} onPointerDownPin={onPinPointerDown} />
            ))}
            {comps.flatMap((component) => component.type !== 'probe' ? [] : [
              <text key={`value-${component.id}`} x={component.x} y={component.y + 30} textAnchor="middle" fontSize={9} fontWeight={700} fontFamily="monospace" fill={compLit(component) ? '#059669' : '#64748b'} pointerEvents="none">{compLit(component) ? '5.00V' : '0.00V'}</text>,
            ])}
          </g>
        </svg>
      </div>
      {isSimulation && <div className="absolute bottom-2.5 right-2.5 z-10 w-[312px] rounded-sm shadow-lg"><ScopeView sample={scopeSample} running={running} /></div>}
    </div>
  );
}

/* ============================================================
   PROPERTY EDITOR
============================================================ */
function PropEditor({ comp, onChange }: { comp: Comp; onChange: (props: Record<string, any>) => void }) {
  const set = (k: string, v: any) => onChange({ ...comp.props, [k]: v });

  if (comp.type === 'resistor' || comp.type === 'capacitor' || comp.type === 'inductor') {
    return (
      <input aria-label="Giá trị linh kiện" value={String(comp.props.value ?? '')} onChange={(e) => set('value', e.target.value)}
        placeholder="VD: 10k / 100nF"
        className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1 text-[11px] focus:border-blue-900 focus:outline-none" />
    );
  }
  if (comp.type === 'clock') {
    return (
      <label className="mt-1 flex items-center gap-2 text-[11px] text-slate-600">
        Tần số
        <input type="number" min={0.1} step={0.1} value={Number(comp.props.freqHz ?? 1)}
          onChange={(e) => { if (Number.isFinite(e.currentTarget.valueAsNumber)) set('freqHz', e.currentTarget.valueAsNumber); }}
          className="w-16 rounded-sm border border-slate-300 px-1.5 py-0.5 text-[11px] focus:border-blue-900 focus:outline-none" />
        Hz
      </label>
    );
  }
  if (comp.type === 'switch') {
    return (
      <button onClick={() => set('on', !comp.props.on)}
        className={`mt-1 w-full rounded-sm py-1 text-[10px] font-black uppercase tracking-wider text-white transition ${
          comp.props.on ? 'bg-emerald-600' : 'bg-slate-400'
        }`}>
        {comp.props.on ? 'Bật — nhấn tắt' : 'Tắt — nhấn bật'}
      </button>
    );
  }
  if (comp.type === 'led') {
    return (
      <div className="mt-1 flex gap-1">
        {LED_COLORS.map(([c, label]) => (
          <button key={c} title={label} onClick={() => set('color', c)}
            style={{ background: c }}
            className={`h-5 w-5 rounded-full border-2 transition ${
              comp.props.color === c ? 'border-blue-900 scale-110' : 'border-transparent'
            }`} />
        ))}
      </div>
    );
  }
  if (comp.type === 'battery') {
    return (
      <input aria-label="Điện áp pin" value={String(comp.props.voltage ?? '')} onChange={(e) => set('voltage', e.target.value)}
        placeholder="VD: 9V"
        className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1 text-[11px] focus:border-blue-900 focus:outline-none" />
    );
  }
  return <div className="mt-0.5 text-[10px] italic text-slate-400">Không có thuộc tính chỉnh sửa</div>;
}
