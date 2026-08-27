import type { Schema } from '@google/genai';
import { HttpError } from '../utils/errors.js';
import { getAiProvider, getGeminiApiKey } from './appSettings.js';
import * as gemini from './gemini.js';
import * as ollama from './ollama.js';

export type { GenerateJSONOptions, GenerateTextOptions } from './gemini.js';

function isUnavailable(e: unknown): boolean {
  return e instanceof HttpError && (e.code === 'NO_API_KEY' || e.code === 'OLLAMA_UNREACHABLE' || e.code === 'OLLAMA_ERROR' || e.status === 502);
}

export async function generateText(options: { prompt: string; temperature?: number; feature: string }): Promise<string> {
  const provider = getAiProvider();
  if (provider === 'cloud') return gemini.generateText(options);
  if (provider === 'local') return ollama.generateText(options);
  try {
    return await ollama.generateText(options);
  } catch (e) {
    if (!isUnavailable(e) || !getGeminiApiKey()) throw e;
    return gemini.generateText(options);
  }
}

export async function generateJSON<T>(options: { prompt: string; schema: Schema; temperature?: number; feature: string }): Promise<T> {
  const provider = getAiProvider();
  if (provider === 'cloud') return gemini.generateJSON<T>(options);
  if (provider === 'local') return ollama.generateJSON<T>(options);
  try {
    return await ollama.generateJSON<T>(options);
  } catch (e) {
    if (!isUnavailable(e) || !getGeminiApiKey()) throw e;
    return gemini.generateJSON<T>(options);
  }
}
