import { useMemo, useState } from 'react';
import { Card, Label, PageHeader } from '../components/ui';

interface GateNet {
  id: string;
  name: string;
  description: string;
  inputs: string[];
  gates: { expr: string; label: string }[];
}

function evalExpr(expr: string, vars: Record<string, boolean>): boolean {
  const tokens = expr
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .split(/\s+/)
    .filter(Boolean);
  let pos = 0;

  function parsePrimary(): boolean {
    const token = tokens[pos];
    if (token === undefined) return false;
    if (token === '(') {
      pos++;
      const v = parseOr();
      pos++;
      return v;
    }
    if (token === 'NOT') {
      pos++;
      return !parsePrimary();
    }
    pos++;
    if (token === '0') return false;
    if (token === '1') return true;
    return vars[token] ?? false;
  }

  function parseAnd(): boolean {
    let v = parsePrimary();
    while (tokens[pos] === 'AND') {
      pos++;
      v = v && parsePrimary();
    }
    return v;
  }

  function parseOr(): boolean {
    let v = parseAnd();
    while (tokens[pos] === 'OR') {
      pos++;
      v = v || parseAnd();
    }
    return v;
  }

  return parseOr();
}

const LOGIC_PRESETS: GateNet[] = [
  {
    id: 'half-adder',
    name: 'Bộ bán cộng (Half Adder)',
    description: 'Cộng 2 bit A + B → tổng S và số nhớ C.',
    inputs: ['A', 'B'],
    gates: [
      { expr: '( A OR B ) AND NOT ( A AND B )', label: 'S = A ⊕ B (tổng)' },
      { expr: 'A AND B', label: 'C = A · B (nhớ)' },
    ],
  },
  {
    id: 'full-adder',
    name: 'Bộ cộng đầy đủ (Full Adder)',
    description: 'Cộng A + B + nhớ vào Cin → S và Cout.',
    inputs: ['A', 'B', 'Cin'],
    gates: [
      { expr: 'A XOR B', label: 'P = A ⊕ B' },
      { expr: '( A XOR B ) XOR Cin', label: 'S = P ⊕ Cin (tổng)' },
      { expr: '( A AND B ) OR ( P AND Cin )', label: 'Cout = A·B + P·Cin (nhớ ra)' },
    ],
  },
  {
    id: 'majority',
    name: 'Cổng đa số (3 đầu vào)',
    description: 'Ra 1 khi có ít nhất 2 trong 3 đầu vào bằng 1.',
    inputs: ['A', 'B', 'C'],
    gates: [
      { expr: '( A AND B ) OR ( B AND C ) OR ( A AND C )', label: 'Y = AB + BC + AC' },
    ],
  },
  {
    id: 'sr-combo',
    name: 'Kết hợp NOT – AND',
    description: 'Ví dụ mạch khóa: Y chỉ bật khi A bật và B tắt.',
    inputs: ['A', 'B'],
    gates: [
      { expr: 'NOT B', label: 'X = NOT B' },
      { expr: 'A AND NOT B', label: 'Y = A · NOT B' },
    ],
  },
];

function LogicLab() {
  const [presetId, setPresetId] = useState('half-adder');
  const preset = LOGIC_PRESETS.find((p) => p.id === presetId) ?? LOGIC_PRESETS[0]!;
  const [states, setStates] = useState<Record<string, Record<string, boolean>>>({});

  const netStates = states[preset.id] ?? {};
  function toggle(input: string) {
    setStates((prev) => ({
      ...prev,
      [preset.id]: { ...(prev[preset.id] ?? {}), [input]: !(prev[preset.id]?.[input] ?? false) },
    }));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit p-4">
        <Label>Chọn mạch mẫu</Label>
        <ul className="space-y-1">
          {LOGIC_PRESETS.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setPresetId(p.id)}
                className={`w-full rounded-sm px-3 py-2 text-left text-sm transition ${p.id === presetId ? 'bg-blue-50 font-medium text-blue-900' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-slate-500">{preset.description}</p>
      </Card>

      <Card className="p-5">
        <h3 className="mb-4 font-semibold text-slate-800">{preset.name}</h3>
        <div className="mb-5 flex flex-wrap gap-4">
          {preset.inputs.map((inp) => (
            <button
              key={inp}
              onClick={() => toggle(inp)}
              className={`flex items-center gap-3 rounded-sm border px-4 py-3 transition ${
                netStates[inp] ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <span className={`relative h-6 w-11 rounded-full transition ${netStates[inp] ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${netStates[inp] ? 'left-[22px]' : 'left-0.5'}`} />
              </span>
              <b className="text-lg text-slate-800">{inp}</b>
              <span className="font-mono text-sm text-slate-500">{netStates[inp] ? 1 : 0}</span>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {preset.gates.map((gate) => {
            const value = evalExpr(gate.expr, netStates);
            return (
              <div key={gate.label} className="flex items-center justify-between rounded-sm border border-slate-200 px-4 py-3">
                <span className="font-mono text-sm text-slate-700">{gate.label}</span>
                <span className={`flex h-9 w-9 items-center justify-center rounded-sm font-mono text-xl font-bold ${value ? 'bg-emerald-600 text-white shadow-[0_0_18px_rgba(16,185,129,0.7)]' : 'bg-slate-100 text-slate-400'}`}>
                  {value ? 1 : 0}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xs text-slate-600">Bật/tắt các công tắc đầu vào và quan sát tín hiệu lan truyền qua cổng logic.</p>
      </Card>
    </div>
  );
}

function DcLab() {
  const [voltage, setVoltage] = useState(12);
  const [mode, setMode] = useState<'series' | 'parallel'>('series');
  const [r1, setR1] = useState(50);
  const [r2, setR2] = useState(100);

  const calc = useMemo(() => {
    const rt = mode === 'series' ? r1 + r2 : (r1 * r2) / (r1 + r2);
    const i = voltage / rt;
    const pTotal = voltage * i;
    const u1 = mode === 'series' ? i * r1 : voltage;
    const u2 = mode === 'series' ? i * r2 : voltage;
    const i1 = mode === 'series' ? i : voltage / r1;
    const i2 = mode === 'series' ? i : voltage / r2;
    return { rt, i, pTotal, u1, u2, i1, i2, p1: u1 * i1, p2: u2 * i2 };
  }, [voltage, mode, r1, r2]);

  const lampGlow = Math.min(1, calc.pTotal / 6);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card className="h-fit space-y-4 p-5">
        <div>
          <Label>Nguồn U = {voltage} V</Label>
          <input type="range" min={1} max={24} value={voltage} aria-label="Điện áp nguồn" onChange={(e) => setVoltage(Number(e.target.value))} className="w-full accent-blue-900" />
        </div>
        <div>
          <Label>Kiểu mắc</Label>
          <div className="flex gap-2">
            {(['series', 'parallel'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-sm px-3 py-2 text-sm font-medium transition ${mode === m ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {m === 'series' ? 'Nối tiếp' : 'Song song'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>R₁ = {r1} Ω</Label>
          <input type="range" min={1} max={200} value={r1} aria-label="Điện trở R1" onChange={(e) => setR1(Number(e.target.value))} className="w-full accent-blue-900" />
        </div>
        <div>
          <Label>R₂ = {r2} Ω</Label>
          <input type="range" min={1} max={200} value={r2} aria-label="Điện trở R2" onChange={(e) => setR2(Number(e.target.value))} className="w-full accent-blue-900" />
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-5 flex flex-wrap items-center justify-center gap-8 py-6">
          <div className="text-center">
            <div className="mx-auto mb-2 flex h-20 w-14 items-center justify-end rounded border-2 border-slate-500 bg-slate-900 px-1 pb-1">
              <div className="h-full w-full rounded-sm" style={{ background: `linear-gradient(to top, rgba(245,158,11,${lampGlow}) 0%, transparent ${lampGlow * 100}%)` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">Nguồn {voltage}V</p>
          </div>
          <div className="text-center text-3xl text-amber-500"><i className="fas fa-lightbulb" /><span className="block text-xs text-slate-500">R₁={r1}Ω</span></div>
          <div className="text-center text-3xl text-amber-500"><i className="fas fa-lightbulb" /><span className="block text-xs text-slate-500">R₂={r2}Ω</span></div>
        </div>

        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-200">
            <Row label="Điện trở tương đương R_tđ" value={`${calc.rt.toFixed(1)} Ω`} />
            <Row label="Dòng điện tổng I = U / R_tđ" value={`${calc.i.toFixed(3)} A`} highlight />
            <Row label="Công suất tổng P = U × I" value={`${calc.pTotal.toFixed(2)} W`} highlight />
            <Row label={`U trên R₁ (${mode === 'series' ? 'tỉ lệ thuận' : 'bằng nguồn'})`} value={`${calc.u1.toFixed(2)} V`} />
            <Row label={`U trên R₂`} value={`${calc.u2.toFixed(2)} V`} />
            <Row label={`I qua R₁`} value={`${calc.i1.toFixed(3)} A`} />
            <Row label={`I qua R₂`} value={`${calc.i2.toFixed(3)} A`} />
            <Row label={`P trên R₁`} value={`${calc.p1.toFixed(2)} W`} />
            <Row label={`P trên R₂`} value={`${calc.p2.toFixed(2)} W`} />
          </tbody>
        </table>
        <p className="mt-4 text-xs text-slate-600">
          {mode === 'series'
            ? 'Mắc nối tiếp: cùng dòng điện, điện trở tổng tăng, đèn yếu hơn.'
            : 'Mắc song song: cùng điện áp, điện trở tổng giảm, dòng tổng lớn hơn.'}
        </p>
      </Card>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <tr>
      <td className="py-2 text-slate-500">{label}</td>
      <td className={`py-2 text-right font-mono ${highlight ? 'text-base font-bold text-blue-900' : 'text-slate-700'}`}>{value}</td>
    </tr>
  );
}

export default function LabPage() {
  const [tab, setTab] = useState<'logic' | 'dc'>('logic');
  return (
    <div>
      <PageHeader title="Phòng lab ảo" subtitle="Thí nghiệm an toàn ngay trên lớp — GV chiếu máy, HV cũng tự thử được qua LAN" />
      <div className="mb-5 flex w-fit gap-1 rounded-sm border border-slate-200 bg-slate-100 p-1">
        {([['logic', 'fa-plug', 'Mạch logic'], ['dc', 'fa-bolt', 'Mạch điện DC']] as const).map(([k, icon, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex items-center gap-2 rounded-sm px-4 py-2 text-sm font-medium transition ${tab === k ? 'bg-blue-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>
            <i className={`fas ${icon}`} /> {l}
          </button>
        ))}
      </div>
      {tab === 'logic' ? <LogicLab /> : <DcLab />}
    </div>
  );
}
