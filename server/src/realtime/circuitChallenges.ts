import type { CircuitChallenge, RoomState } from './gameTypes.js';

export function buildDigitalDefaultChallenges(): CircuitChallenge[] {
  let sequence = 0;
  interface Part { id: string; type: string; x: number; y: number; rot: number; props: Record<string, unknown> }
  const component = (type: string, x: number, y: number, props: Record<string, unknown> = {}): Part =>
    ({ id: `dc${sequence++}`, type, x, y, rot: 0, props });
  const wire = (from: { id: string }, fromPort: string, to: { id: string }, toPort: string): Record<string, unknown> =>
    ({ id: `dw${sequence++}`, from: `${from.id}::${fromPort}`, to: `${to.id}::${toPort}` });

  const v1 = component('vcc', 180, 140);
  const s1 = component('switch', 320, 140, { on: false });
  const l1 = component('led', 460, 140, { color: '#ef4444' });
  const g1 = component('gnd', 460, 260);
  const ledChallenge: CircuitChallenge = {
    id: 'digital_1', title: 'Đóng mạch đèn LED',
    description: 'Nối nguồn VCC qua công tắc tới đèn LED rồi xuống GND.',
    targetBehavior: 'Bật công tắc → LED sáng', starterCircuit: null,
    referenceCircuit: { components: [v1, s1, l1, g1], wires: [wire(v1, 'out', s1, 'in'), wire(s1, 'out', l1, 'anode'), wire(l1, 'cathode', g1, 'out')] },
    testCases: [], points: 100,
  };

  const v2 = component('vcc', 140, 160);
  const switchA = component('switch', 280, 90, { on: false });
  const switchB = component('switch', 280, 230, { on: false });
  const andGate = component('and', 430, 160);
  const l2 = component('led', 570, 160, { color: '#22c55e' });
  const g2 = component('gnd', 570, 280);
  const andChallenge: CircuitChallenge = {
    id: 'digital_2', title: 'Cổng AND — hai chìa khoá',
    description: 'Dựng mạch chỉ khi BẬT cả hai công tắc thì đèn mới sáng.',
    targetBehavior: 'Cả hai công tắc ON → LED sáng; thiếu một → tắt', starterCircuit: null,
    referenceCircuit: { components: [v2, switchA, switchB, andGate, l2, g2], wires: [
      wire(v2, 'out', switchA, 'in'), wire(v2, 'out', switchB, 'in'),
      wire(switchA, 'out', andGate, 'a'), wire(switchB, 'out', andGate, 'b'),
      wire(andGate, 'y', l2, 'anode'), wire(l2, 'cathode', g2, 'out'),
    ] },
    testCases: [], points: 150,
  };

  const v3 = component('vcc', 180, 150);
  const s3 = component('switch', 320, 150, { on: true });
  const notGate = component('not', 450, 150);
  const l3 = component('led', 580, 150, { color: '#3b82f6' });
  const g3 = component('gnd', 580, 270);
  const notChallenge: CircuitChallenge = {
    id: 'digital_3', title: 'Mạch đảo NOT',
    description: 'LED phải sáng khi công tắc đang TẮT và ngừng sáng khi bật.',
    targetBehavior: 'Tắt công tắc → LED sáng · Bật công tắc → LED tắt',
    starterCircuit: { components: [v3, s3, notGate, l3, g3], wires: [] },
    referenceCircuit: { components: [v3, s3, notGate, l3, g3], wires: [
      wire(v3, 'out', s3, 'in'), wire(s3, 'out', notGate, 'a'),
      wire(notGate, 'y', l3, 'anode'), wire(l3, 'cathode', g3, 'out'),
    ] },
    testCases: [], points: 150,
  };

  const data = component('switch', 180, 110, { on: false });
  const clock = component('clock', 180, 230, { freqHz: 1 });
  const dff = component('dff', 390, 160);
  const led = component('led', 570, 120, { color: '#a855f7' });
  const probe = component('probe', 570, 230);
  const ground = component('gnd', 570, 320);
  const dffChallenge: CircuitChallenge = {
    id: 'digital_4', title: 'D Flip-Flop — chốt dữ liệu theo xung clock',
    description: 'Nối DATA vào D và CLOCK vào CLK. Quan sát Q trên LED và Probe/Oscilloscope; Q chỉ đổi ở cạnh lên của clock.',
    targetBehavior: 'Q chốt giá trị DATA tại cạnh lên CLK và giữ nguyên giữa hai xung',
    starterCircuit: { components: [data, clock, dff, led, probe, ground], wires: [] },
    referenceCircuit: { components: [data, clock, dff, led, probe, ground], wires: [
      wire(data, 'out', dff, 'd'), wire(clock, 'out', dff, 'clk'),
      wire(dff, 'q', led, 'anode'), wire(dff, 'q', probe, 'in'), wire(led, 'cathode', ground, 'out'),
    ] },
    testCases: [], points: 200,
  };

  const halfA = component('switch', 140, 110, { on: false });
  const halfB = component('switch', 140, 230, { on: false });
  const halfAdder = component('half_adder', 360, 170);
  const halfSumLed = component('led', 570, 110, { color: '#2563eb' });
  const halfCarryLed = component('led', 570, 230, { color: '#f97316' });
  const halfSumProbe = component('probe', 720, 110);
  const halfCarryProbe = component('probe', 720, 230);
  const halfSumGround = component('gnd', 570, 310);
  const halfCarryGround = component('gnd', 650, 350);
  const halfAdderChallenge: CircuitChallenge = {
    id: 'digital_5', title: 'Half Adder — tổng S và bit nhớ C',
    description: 'Nối hai đầu vào A/B vào Half Adder. Quan sát S và C đồng thời bằng LED và Probe/Oscilloscope.',
    targetBehavior: 'S = A XOR B; C = A AND B',
    starterCircuit: { components: [halfA, halfB, halfAdder, halfSumLed, halfCarryLed, halfSumProbe, halfCarryProbe, halfSumGround, halfCarryGround], wires: [] },
    referenceCircuit: { components: [halfA, halfB, halfAdder, halfSumLed, halfCarryLed, halfSumProbe, halfCarryProbe, halfSumGround, halfCarryGround], wires: [
      wire(halfA, 'out', halfAdder, 'a'), wire(halfB, 'out', halfAdder, 'b'),
      wire(halfAdder, 'sum', halfSumLed, 'anode'), wire(halfAdder, 'sum', halfSumProbe, 'in'),
      wire(halfAdder, 'carry', halfCarryLed, 'anode'), wire(halfAdder, 'carry', halfCarryProbe, 'in'),
      wire(halfSumLed, 'cathode', halfSumGround, 'out'), wire(halfCarryLed, 'cathode', halfCarryGround, 'out'),
    ] },
    testCases: [], points: 200,
  };

  const fullA = component('switch', 120, 90, { on: false });
  const fullB = component('switch', 120, 170, { on: false });
  const fullCarryIn = component('switch', 120, 250, { on: false });
  const fullAdder = component('full_adder', 360, 170);
  const fullSumLed = component('led', 570, 110, { color: '#16a34a' });
  const fullCarryLed = component('led', 570, 230, { color: '#e11d48' });
  const fullSumProbe = component('probe', 720, 110);
  const fullCarryProbe = component('probe', 720, 230);
  const fullSumGround = component('gnd', 570, 310);
  const fullCarryGround = component('gnd', 650, 350);
  const fullAdderChallenge: CircuitChallenge = {
    id: 'digital_6', title: 'Full Adder — cộng A, B và Cin',
    description: 'Hoàn thiện mạch Full Adder ba đầu vào. Dùng LED và Probe để đối chiếu bit tổng S cùng bit nhớ Cout.',
    targetBehavior: 'S là parity của A/B/Cin; Cout HIGH khi có ít nhất hai đầu vào HIGH',
    starterCircuit: { components: [fullA, fullB, fullCarryIn, fullAdder, fullSumLed, fullCarryLed, fullSumProbe, fullCarryProbe, fullSumGround, fullCarryGround], wires: [] },
    referenceCircuit: { components: [fullA, fullB, fullCarryIn, fullAdder, fullSumLed, fullCarryLed, fullSumProbe, fullCarryProbe, fullSumGround, fullCarryGround], wires: [
      wire(fullA, 'out', fullAdder, 'a'), wire(fullB, 'out', fullAdder, 'b'), wire(fullCarryIn, 'out', fullAdder, 'cin'),
      wire(fullAdder, 'sum', fullSumLed, 'anode'), wire(fullAdder, 'sum', fullSumProbe, 'in'),
      wire(fullAdder, 'cout', fullCarryLed, 'anode'), wire(fullAdder, 'cout', fullCarryProbe, 'in'),
      wire(fullSumLed, 'cathode', fullSumGround, 'out'), wire(fullCarryLed, 'cathode', fullCarryGround, 'out'),
    ] },
    testCases: [], points: 250,
  };

  return [ledChallenge, andChallenge, notChallenge, dffChallenge, halfAdderChallenge, fullAdderChallenge];
}

export function configureCircuitSimulateChallenges(room: RoomState): void {
  const starter = (room.circuitTemplate as { components: unknown[]; wires: unknown[] } | null) ?? null;
  const custom = room.simulateChallenges && room.simulateChallenges.length > 0 ? room.simulateChallenges : null;
  room.circuitSimulateChallenges = custom
    ? custom.map((challenge) => ({ ...challenge }))
    : buildDigitalDefaultChallenges();
  if (!custom && starter && room.circuitSimulateChallenges[0]) {
    room.circuitSimulateChallenges[0].starterCircuit = starter;
  }
}
