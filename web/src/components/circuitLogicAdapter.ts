export type LogicState = boolean;

export interface SimulationPin {
  id: string;
  dir: 'in' | 'out';
}

export interface SimulationComponent {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

export interface SimulationWire {
  from: string;
  to: string;
}

export interface SimulationResult {
  pinVal: Record<string, LogicState>;
  netRoot: Record<string, LogicState>;
}

/**
 * A swappable boundary for circuit solvers. The canvas owns SVG interaction and
 * serialisation; an adapter only receives the normalized circuit graph.
 */
export interface LogicSimulationAdapter {
  readonly id: string;
  simulate(components: SimulationComponent[], wires: SimulationWire[], timeSeconds: number): SimulationResult;
}

interface NativeLogicAdapterOptions {
  pinsForType: (type: string) => readonly SimulationPin[] | undefined;
}

const gateTypes = new Set(['and', 'nand', 'or', 'nor', 'not', 'buf', 'xor', 'xnor', 'mux2', 'half_adder', 'full_adder']);
const pinKey = (componentId: string, pinId: string) => `${componentId}::${pinId}`;

function evalGate(type: string, inputs: LogicState[]): LogicState {
  const highCount = inputs.filter(Boolean).length;
  switch (type) {
    case 'and': return inputs.length > 0 && highCount === inputs.length;
    case 'nand': return !(inputs.length > 0 && highCount === inputs.length);
    case 'or': return highCount > 0;
    case 'nor': return highCount === 0;
    case 'not': return !inputs[0];
    case 'buf': return !!inputs[0];
    case 'xor': return highCount % 2 === 1;
    case 'xnor': return highCount % 2 === 0;
    case 'mux2': return inputs[2] ? !!inputs[1] : !!inputs[0];
    default: return false;
  }
}

function evaluateOutputs(type: string, inputs: LogicState[]): LogicState[] {
  if (type === 'half_adder') return [!!inputs[0] !== !!inputs[1], !!inputs[0] && !!inputs[1]];
  if (type === 'full_adder') {
    const highCount = inputs.filter(Boolean).length;
    return [highCount % 2 === 1, highCount >= 2];
  }
  return [evalGate(type, inputs)];
}

/**
 * Current local-first boolean solver. It intentionally models only the
 * digital subset; analog components remain drawable but are not approximated.
 */
export function createNativeLogicAdapter({ pinsForType }: NativeLogicAdapterOptions): LogicSimulationAdapter {
  return {
    id: 'native-boolean-v1',
    simulate(components, wires, timeSeconds) {
      const parent = new Map<string, string>();
      const find = (key: string): string => {
        let root = key;
        while (parent.get(root) !== root) root = parent.get(root)!;
        return root;
      };

      for (const component of components) {
        for (const pin of pinsForType(component.type) ?? []) {
          const key = pinKey(component.id, pin.id);
          parent.set(key, key);
        }
      }
      for (const wire of wires) {
        if (!parent.has(wire.from) || !parent.has(wire.to)) continue;
        const left = find(wire.from);
        const right = find(wire.to);
        if (left !== right) parent.set(left, right);
      }

      const netValue = new Map<string, LogicState>();
      const read = (key: string) => netValue.get(find(key)) ?? false;
      const drive = (key: string, value: LogicState) => { netValue.set(find(key), value); };

      for (const component of components) {
        const output = (pinsForType(component.type) ?? []).find((pin) => pin.dir === 'out');
        if (!output) continue;
        const key = pinKey(component.id, output.id);
        switch (component.type) {
          case 'vcc': drive(key, true); break;
          case 'gnd': drive(key, false); break;
          case 'clock': {
            const frequency = Math.max(0.1, Number(component.props.freqHz) || 1);
            drive(key, Math.floor(timeSeconds * frequency * 2) % 2 === 1);
            break;
          }
          case 'switch': drive(key, !!component.props.on); break;
        }
      }

      const maxIterations = components.filter((component) => gateTypes.has(component.type)).length + 2;
      for (let iteration = 0; iteration <= maxIterations; iteration++) {
        let changed = false;
        for (const component of components) {
          if (!gateTypes.has(component.type)) continue;
          const inputs: LogicState[] = [];
          const outputs: SimulationPin[] = [];
          for (const pin of pinsForType(component.type) ?? []) {
            if (pin.dir === 'in') inputs.push(read(pinKey(component.id, pin.id)));
            else outputs.push(pin);
          }
          const values = evaluateOutputs(component.type, inputs);
          for (const [index, output] of outputs.entries()) {
            const key = pinKey(component.id, output.id);
            const value = values[index] ?? false;
            if ((netValue.get(find(key)) ?? false) !== value) {
              drive(key, value);
              changed = true;
            }
          }
        }
        if (!changed) break;
      }

      const pinVal: Record<string, LogicState> = {};
      const netRoot: Record<string, LogicState> = {};
      for (const component of components) {
        for (const pin of pinsForType(component.type) ?? []) {
          const key = pinKey(component.id, pin.id);
          const value = read(key);
          pinVal[key] = value;
          netRoot[find(key)] = value;
        }
      }
      return { pinVal, netRoot };
    },
  };
}
