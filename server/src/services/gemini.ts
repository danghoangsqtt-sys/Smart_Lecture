import { GoogleGenAI, type Schema, type Type } from '@google/genai';
import { HttpError } from '../utils/errors.js';
import { getGeminiApiKey } from './appSettings.js';
import { consumeQuota } from './quota.js';

const MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'] as const;
const QUEUE_GAP_MS = 1500;
const MAX_ATTEMPTS_PER_MODEL = 3;

let queueTail: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(message: string): boolean {
  return /429|RESOURCE_EXHAUSTED|quota/i.test(message);
}

function isOverload(message: string): boolean {
  return /503|UNAVAILABLE|overloaded/i.test(message);
}

async function callModel(model: string, prompt: string, schema: Schema | null, temperature: number): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new HttpError(
      400,
      'NO_API_KEY',
      'Chưa cấu hình Gemini API key. Vào Cài đặt để nhập key (lấy miễn phí tại aistudio.google.com).'
    );
  }
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: schema
      ? {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature,
        }
      : { temperature },
  });
  return response.text ?? '';
}

export interface GenerateJSONOptions {
  prompt: string;
  schema: Schema;
  temperature?: number;
  feature: string;
}

export async function generateJSON<T>(options: GenerateJSONOptions): Promise<T> {
  consumeQuota(options.feature);
  const run = async (): Promise<T> => {
    let lastError: unknown = null;
    for (const model of MODEL_CHAIN) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
        try {
          const text = await callModel(model, options.prompt, options.schema, options.temperature ?? 0.4);
          return JSON.parse(text) as T;
        } catch (error) {
          lastError = error;
          if (error instanceof HttpError) throw error;
          const message = String((error as Error)?.message ?? error);
          if (isRetryableStatus(message)) {
            await sleep(2500 * 2 ** attempt + Math.random() * 1500);
          } else if (isOverload(message)) {
            await sleep(1500 * (attempt + 1));
          } else {
            break;
          }
        }
      }
    }
    throw new HttpError(
      502,
      'AI_FAILED',
      `Không gọi được AI sau nhiều lần thử. Chi tiết: ${String((lastError as Error)?.message ?? lastError)}`
    );
  };

  const result = queueTail.then(run, run) as Promise<T>;
  queueTail = result.catch(() => undefined).then(() => sleep(QUEUE_GAP_MS));
  return result;
}

export interface GenerateTextOptions {
  prompt: string;
  temperature?: number;
  feature: string;
}

export async function generateText(options: GenerateTextOptions): Promise<string> {
  consumeQuota(options.feature);
  return queueTail.then(
    () => callModel(MODEL_CHAIN[0]!, options.prompt, null, options.temperature ?? 0.5),
    () => callModel(MODEL_CHAIN[0]!, options.prompt, null, options.temperature ?? 0.5)
  );
}
