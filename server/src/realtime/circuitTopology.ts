import type { CircuitDebriefRow, CircuitLearningDebrief, CircuitValidationCode, RoomState } from './gameTypes.js';

interface TypeLevelNetlist {
  types: Map<string, number>;
  sigs: Map<string, number>;
  wireCount: number;
}

function extractNetlist(circuit: unknown): TypeLevelNetlist | null {
  const obj = circuit as { components?: unknown[]; wires?: unknown[] } | null | undefined;
  if (!obj || !Array.isArray(obj.components) || !Array.isArray(obj.wires)) return null;

  const idType = new Map<string, string>();
  const types = new Map<string, number>();
  for (const component of obj.components) {
    const part = component as { id?: unknown; type?: unknown } | null;
    if (!part || typeof part.id !== 'string' || typeof part.type !== 'string') return null;
    idType.set(part.id, part.type);
    types.set(part.type, (types.get(part.type) ?? 0) + 1);
  }

  const sigs = new Map<string, number>();
  let wireCount = 0;
  const endpointOf = (raw: unknown, explicitPort: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const separator = raw.lastIndexOf('::');
    const componentId = separator >= 0 ? raw.slice(0, separator) : raw;
    const embeddedPort = separator >= 0 ? raw.slice(separator + 2) : '';
    const portId = embeddedPort || (typeof explicitPort === 'string' ? explicitPort : '');
    const type = idType.get(componentId);
    return type ? `${type}:${portId || '?'}` : null;
  };

  for (const wire of obj.wires) {
    const entry = wire as { from?: unknown; to?: unknown; fromPort?: unknown; toPort?: unknown } | null;
    if (!entry || typeof entry.from !== 'string' || typeof entry.to !== 'string') continue;
    const from = endpointOf(entry.from, entry.fromPort);
    const to = endpointOf(entry.to, entry.toPort);
    if (!from || !to || from === to) continue;
    wireCount++;
    const [left, right] = from < to ? [from, to] : [to, from];
    const signature = `${left}~${right}`;
    sigs.set(signature, (sigs.get(signature) ?? 0) + 1);
  }

  return { types, sigs, wireCount };
}

export function circuitsMatch(student: unknown, reference: unknown): boolean {
  const studentNetlist = extractNetlist(student);
  const referenceNetlist = extractNetlist(reference);
  if (!studentNetlist || !referenceNetlist) return false;
  if (studentNetlist.wireCount !== referenceNetlist.wireCount) return false;
  if (studentNetlist.types.size !== referenceNetlist.types.size) return false;
  for (const [type, count] of referenceNetlist.types) {
    if (studentNetlist.types.get(type) !== count) return false;
  }
  if (studentNetlist.sigs.size !== referenceNetlist.sigs.size) return false;
  for (const [signature, count] of referenceNetlist.sigs) {
    if (studentNetlist.sigs.get(signature) !== count) return false;
  }
  return true;
}

export function buildCircuitLearningDebrief(room: RoomState): CircuitLearningDebrief {
  const totalChallenges = room.circuitSimulateChallenges.length;
  const learners = [...room.circuitSimulatePlayers.values()]
    .map((player): CircuitDebriefRow => ({
      userId: player.userId,
      name: player.displayName,
      completedCount: player.completedChallenges.length,
      totalChallenges,
      totalSubmissionAttempts: player.totalSubmissionAttempts,
      incorrectSubmissionAttempts: player.incorrectSubmissionAttempts,
      score: player.score,
    }))
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  const totalCompletions = learners.reduce((sum, learner) => sum + learner.completedCount, 0);
  const totalPossible = learners.length * totalChallenges;
  return {
    summary: {
      learnerCount: learners.length,
      completedAllCount: learners.filter((learner) => totalChallenges > 0 && learner.completedCount === totalChallenges).length,
      totalCompletions,
      totalPossible,
      totalSubmissionAttempts: learners.reduce((sum, learner) => sum + learner.totalSubmissionAttempts, 0),
      incorrectSubmissionAttempts: learners.reduce((sum, learner) => sum + learner.incorrectSubmissionAttempts, 0),
      completionRate: totalPossible > 0 ? Math.round((totalCompletions / totalPossible) * 100) : 0,
    },
    learners,
  };
}

export function circuitValidationResult(student: unknown, reference: unknown): {
  correct: boolean;
  code: CircuitValidationCode;
  feedback: string;
} {
  const studentNetlist = extractNetlist(student);
  const referenceNetlist = extractNetlist(reference);
  if (!studentNetlist || !referenceNetlist) {
    return { correct: false, code: 'invalid_data', feedback: 'Dữ liệu mạch không hợp lệ. Hãy thử nộp lại.' };
  }
  if (circuitsMatch(student, reference)) {
    return { correct: true, code: 'correct', feedback: 'Mạch đúng — kết quả đã được ghi nhận.' };
  }
  if (studentNetlist.wireCount !== referenceNetlist.wireCount) {
    return { correct: false, code: 'wire_count', feedback: `Cần kiểm tra số dây nối (${studentNetlist.wireCount}/${referenceNetlist.wireCount}).` };
  }
  for (const [type, count] of referenceNetlist.types) {
    if (studentNetlist.types.get(type) !== count) {
      return { correct: false, code: 'component_count', feedback: 'Cần kiểm tra lại loại và số lượng linh kiện.' };
    }
  }
  return { correct: false, code: 'connection', feedback: 'Các chân nối chưa đúng. Hãy kiểm tra chiều OUT → IN.' };
}
