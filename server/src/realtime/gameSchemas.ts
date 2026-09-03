import { z } from 'zod';

export const zRoom = z.object({ roomCode: z.string().length(6) });
export const zSessionId = z.object({ sessionId: z.string() });
export const zUserId = z.object({ userId: z.string() });
export const zAnswer = z.object({ choiceIdx: z.number().int().min(-1).max(9).default(-1), text: z.string().max(500).optional() });
export const zMathAnswer = z.object({ answer: z.union([z.string().max(50), z.number()]) });
export const zVerdict = z.object({ userId: z.string(), correct: z.boolean() });
export const zCwTry = z.object({ rowIndex: z.number().int().min(0).max(9), word: z.string().min(1).max(60) });
export const zBingoMark = z.object({ number: z.number().int().min(1).max(75) });
export const zMemoryFlip = z.object({ cardIndex: z.number().int().min(0).max(23) });
export const zWordScrambleGuess = z.object({ word: z.string().min(1).max(60) });
export const zQuizShowAnswer = z.object({ choiceIdx: z.number().int().min(-1).max(3).default(-1), lifeline: z.enum(['fiftyFifty', 'askAudience', 'phoneFriend']).optional() });
export const zCircuitDraw = z.object({
  components: z.array(z.object({
    id: z.string(),
    type: z.string(),
    x: z.number(),
    y: z.number(),
    rotation: z.number().default(0),
    properties: z.record(z.string(), z.unknown()).default({}),
  })),
  wires: z.array(z.object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    fromPort: z.string().optional(),
    toPort: z.string().optional(),
  })),
  submitted: z.boolean().default(false),
});
export const zCircuitSimulate = z.object({
  action: z.enum(['start', 'stop', 'step', 'reset']),
  inputs: z.record(z.string(), z.union([z.number(), z.boolean()])).optional(),
  timeStep: z.number().optional(),
});
export const zCircuitHostControl = z.object({
  action: z.enum(['pause', 'resume', 'extend', 'evaluate', 'skip', 'restart']),
});
export type CircuitHostControlAction = z.infer<typeof zCircuitHostControl>['action'];
export const zCircuitInspect = z.object({ userId: z.string().min(1).max(120) });
export const zCircuitTeacherMessage = z.object({
  userId: z.string().min(1).max(120),
  kind: z.enum(['hint', 'retry']),
  message: z.string().max(300).optional(),
});
export const zCircuitTeacherMessageAck = z.object({ messageId: z.string().uuid() });
export const zCircuitDrawVerify = z.object({ userId: z.string(), correct: z.boolean(), feedback: z.string().optional() });
export const zCircuitMeasurements = z.object({ measurements: z.record(z.string(), z.number()) });
export const zMeasurements = z.record(z.string(), z.number());
export const zCompletedChallenges = z.array(z.string().max(120)).max(50);
