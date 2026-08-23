import { GoogleGenAI } from '@google/genai';
import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { db, queryAll, queryOne, run, tx } from '../db/connection.js';
import { MEDIA_DIR } from '../config.js';
import { getGeminiApiKey } from './appSettings.js';
import { parseDocument } from './docparse.js';

const CHUNK_TARGET = 900;
const CHUNK_OVERLAP = 120;
const EMBED_MODEL = 'text-embedding-004';
const EMBED_BATCH = 80;
const MAX_CHUNKS_PER_DOC = 2000;

export interface RagChunk {
  id: string;
  rag_doc_id: string;
  seq: number;
  heading_path: string;
  text: string;
  page: number;
  embedding: Buffer | null;
}

export interface RetrievedChunk extends RagChunk {
  docName: string;
  score: number;
}

function splitIntoChunks(text: string): { text: string; headingPath: string }[] {
  const lines = text.split('\n');
  const chunks: { text: string; headingPath: string }[] = [];
  let currentHeading = '';
  let buffer: string[] = [];
  let length = 0;

  const flush = () => {
    const joined = buffer.join('\n').trim();
    if (joined.length >= 40) chunks.push({ text: joined, headingPath: currentHeading });
    buffer = [];
    length = 0;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = /^(#{1,4}\s|.+:)$/.test(trimmed) && trimmed.length < 90 && !/[.!?]$/.test(trimmed);
    if (isHeading) {
      if (length >= CHUNK_TARGET * 0.5) flush();
      if (/^#{1,4}\s/.test(trimmed)) currentHeading = trimmed.replace(/^#+\s*/, '');
      else currentHeading = trimmed.replace(/:$/, '');
    }
    buffer.push(line);
    length += line.length;
    if (length >= CHUNK_TARGET) {
      const overflow = buffer.join('\n');
      flush();
      if (overflow.length > CHUNK_TARGET + CHUNK_OVERLAP) {
        const tail = overflow.slice(-(CHUNK_OVERLAP + Math.min(200, overflow.length - CHUNK_OVERLAP)));
        buffer.push(tail);
        length = tail.length;
      }
    }
  }
  flush();
  return chunks.slice(0, MAX_CHUNKS_PER_DOC);
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('NO_API_KEY');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: texts,
    config: { outputDimensionality: 768 },
  });
  const embeddings = response.embeddings ?? [];
  return embeddings.map((e) => e.values as number[]);
}

function float32ToBlob(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) buf.writeFloatLE(values[i] ?? 0, i * 4);
  return buf;
}

function blobToFloat32(blob: Buffer): number[] {
  const out: number[] = [];
  for (let i = 0; i + 4 <= blob.length; i += 4) out.push(blob.readFloatLE(i));
  return out;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function processRagDocument(docId: string): Promise<void> {
  const docRow = queryOne<{ id: string; file_path: string; mime_type: string }>(
    'SELECT id, file_path, mime_type FROM rag_documents WHERE id = ?',
    docId
  );
  if (!docRow) return;
  run("UPDATE rag_documents SET status = 'parsing' WHERE id = ?", docId);

  try {
    const parsed = await parseDocument(path.join(MEDIA_DIR, docRow.file_path), docRow.mime_type);
    const allChunks: { text: string; headingPath: string; page: number }[] = [];
    for (const page of parsed.pages) {
      for (const chunk of splitIntoChunks(page.text)) {
        allChunks.push({ ...chunk, page: page.page });
      }
    }

    run('DELETE FROM rag_chunks WHERE rag_doc_id = ?', docId);
    const insert = db.prepare(
      'INSERT INTO rag_chunks (id, rag_doc_id, seq, heading_path, text, page, embedding) VALUES (?, ?, ?, ?, ?, ?, NULL)'
    );
    tx(() => {
      allChunks.forEach((chunk, seq) => {
        insert.run(`${docId}-${seq}`, docId, seq, chunk.headingPath.slice(0, 200), chunk.text, chunk.page);
      });
    });

    const apiKey = getGeminiApiKey();
    let embedded = 0;
    if (apiKey && allChunks.length > 0) {
      const rows = queryAll<{ id: string; text: string }>(
        'SELECT id, text FROM rag_chunks WHERE rag_doc_id = ? ORDER BY seq',
        docId
      );
      for (let i = 0; i < rows.length; i += EMBED_BATCH) {
        const batch = rows.slice(i, i + EMBED_BATCH);
        try {
          const vectors = await embedBatch(batch.map((r) => r.text));
          const update = db.prepare('UPDATE rag_chunks SET embedding = ? WHERE id = ?');
          tx(() => {
            batch.forEach((row, j) => {
              const vec = vectors[j];
              if (vec) update.run(float32ToBlob(vec), row.id);
            });
          });
          embedded += batch.filter((_, j) => vectors[j]).length;
        } catch {
          break;
        }
      }
    }

    run(
      "UPDATE rag_documents SET status = 'ready', page_count = ?, error_msg = NULL WHERE id = ?",
      parsed.pageCount,
      docId
    );
    console.log(`[rag] doc ${docId}: ${allChunks.length} chunks, ${embedded} embedded${apiKey ? '' : ' (no API key — keyword search mode)'}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    run("UPDATE rag_documents SET status = 'error', error_msg = ? WHERE id = ?", message.slice(0, 500), docId);
    console.error('[rag] processing failed:', message);
  }
}

async function embedQuery(queryText: string): Promise<number[] | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.embedContent({ model: EMBED_MODEL, contents: queryText });
    return (response.embeddings?.[0]?.values as number[]) ?? null;
  } catch {
    return null;
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function keywordScore(chunkText: string, queryTokens: string[]): number {
  const chunkTokens = new Set(tokenize(chunkText));
  let hits = 0;
  for (const token of queryTokens) {
    if (chunkTokens.has(token)) hits++;
    else {
      for (const ct of chunkTokens) {
        if (ct.startsWith(token) || token.startsWith(ct)) {
          hits += 0.5;
          break;
        }
      }
    }
  }
  return hits / Math.max(queryTokens.length, 1);
}

export function listRagChunkStats(ownerId: string): { docs: number; chunks: number; embedded: number } {
  const row = queryOne<{ docs: number; chunks: number; embedded: number }>(
    `SELECT
      (SELECT COUNT(*) FROM rag_documents WHERE owner_id = ? AND status = 'ready') AS docs,
      (SELECT COUNT(*) FROM rag_chunks c JOIN rag_documents d ON d.id = c.rag_doc_id WHERE d.owner_id = ?) AS chunks,
      (SELECT COUNT(*) FROM rag_chunks c JOIN rag_documents d ON d.id = c.rag_doc_id WHERE d.owner_id = ? AND c.embedding IS NOT NULL) AS embedded`,
    ownerId,
    ownerId,
    ownerId
  );
  return row ?? { docs: 0, chunks: 0, embedded: 0 };
}

export async function retrieveWithVectors(ownerId: string, query: string, topK = 6): Promise<RetrievedChunk[]> {
  const rows = queryAll<RagChunk & { docName: string }>(
    `SELECT c.*, d.filename AS docName FROM rag_chunks c JOIN rag_documents d ON d.id = c.rag_doc_id
     WHERE d.owner_id = ? AND d.status = 'ready'`,
    ownerId
  );
  if (rows.length === 0) return [];

  const embeddedRows = rows.filter((r) => r.embedding && r.embedding.length > 0);
  const qVec = await embedQuery(query);

  if (qVec && embeddedRows.length > 0) {
    const scored = embeddedRows.map((r) => ({
      ...r,
      docName: r.docName,
      score: cosine(qVec, blobToFloat32(r.embedding as Buffer)),
    }));
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topK).filter((r) => r.score > 0.3);
    if (top.length >= 2) return top;
  }

  const qTokens = tokenize(query);
  const fallback = rows.map((r) => ({ ...r, docName: r.docName, score: keywordScore(r.text, qTokens) }));
  fallback.sort((a, b) => b.score - a.score);
  return fallback.filter((r) => r.score > 0.15).slice(0, topK);
}

export function deleteRagDocument(docId: string, userId: string): boolean {
  const doc = queryOne<{ id: string; file_path: string; owner_id: string }>(
    'SELECT id, file_path, owner_id FROM rag_documents WHERE id = ?',
    docId
  );
  if (!doc || doc.owner_id !== userId) return false;
  run('DELETE FROM rag_chunks WHERE rag_doc_id = ?', docId);
  run('DELETE FROM rag_documents WHERE id = ?', docId);
  try {
    unlinkSync(path.join(MEDIA_DIR, doc.file_path));
  } catch {
    /* file may already be gone */
  }
  return true;
}
