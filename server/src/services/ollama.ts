import { Type, type Schema } from '@google/genai';
import { HttpError } from '../utils/errors.js';
import { getOllamaBaseUrl, getOllamaModel } from './appSettings.js';
import type { GenerateJSONOptions, GenerateTextOptions } from './gemini.js';

const GEN_TIMEOUT_MS = 60_000; // local generation can be slow on laptop GPU/CPU
const STATUS_TIMEOUT_MS = 2_500;
const NUM_CTX = 8192; // Ollama's default (2048-4096) would silently truncate long source docs

const TYPE_MAP: Partial<Record<Type, string>> = {
  [Type.STRING]: 'string',
  [Type.NUMBER]: 'number',
  [Type.INTEGER]: 'integer',
  [Type.BOOLEAN]: 'boolean',
  [Type.ARRAY]: 'array',
  [Type.OBJECT]: 'object',
};

function schemaToJsonSchema(schema: Schema): unknown {
  const out: Record<string, unknown> = {};
  if (schema.type) out['type'] = TYPE_MAP[schema.type] ?? 'string';
  if (schema.description) out['description'] = schema.description;
  if (schema.enum) out['enum'] = schema.enum;
  if (schema.nullable) out['nullable'] = schema.nullable;
  if (schema.items) out['items'] = schemaToJsonSchema(schema.items);
  if (schema.properties) {
    out['properties'] = Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [key, schemaToJsonSchema(value)])
    );
  }
  if (schema.required) out['required'] = schema.required;
  return out;
}

async function callOllama(prompt: string, format: unknown, temperature: number): Promise<string> {
  const baseUrl = getOllamaBaseUrl();
  const model = getOllamaModel();
  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEN_TIMEOUT_MS);
    res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, format, options: { temperature, num_ctx: NUM_CTX } }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    throw new HttpError(
      502,
      'OLLAMA_UNREACHABLE',
      `Không kết nối được Ollama tại ${baseUrl}. Chạy "ollama serve" hoặc kiểm tra lại trong Cài đặt.`
    );
  }
  if (!res.ok) {
    throw new HttpError(502, 'OLLAMA_ERROR', `Ollama lỗi (${res.status}). Kiểm tra model "${model}" đã pull chưa (ollama pull ${model}).`);
  }
  return ((await res.json()) as { response?: string }).response ?? '';
}

export async function generateText(options: GenerateTextOptions): Promise<string> {
  return callOllama(options.prompt, undefined, options.temperature ?? 0.5);
}

export async function generateJSON<T>(options: GenerateJSONOptions): Promise<T> {
  const text = await callOllama(options.prompt, schemaToJsonSchema(options.schema), options.temperature ?? 0.4);
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/[{[][\s\S]*[}\]]/); // local models sometimes wrap JSON in prose despite format constraint
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        // fall through to error below
      }
    }
    throw new HttpError(502, 'AI_FAILED', 'Model cục bộ trả về JSON không hợp lệ. Thử lại hoặc đổi model trong Cài đặt.');
  }
}

export async function checkOllamaStatus(): Promise<{ reachable: boolean; models: string[]; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
    const res = await fetch(`${getOllamaBaseUrl()}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { reachable: false, models: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as { models?: { name: string }[] };
    return { reachable: true, models: (data.models ?? []).map((m) => m.name) };
  } catch (error) {
    return { reachable: false, models: [], error: error instanceof Error ? error.message : String(error) };
  }
}
