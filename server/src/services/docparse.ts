import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface ParsedDoc {
  pages: { page: number; text: string }[];
  pageCount: number;
}

function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function parseDocument(filePath: string, mime: string): Promise<ParsedDoc> {
  if (!existsSync(filePath)) throw new Error('Tệp không tồn tại trên đĩa');
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt' || ext === '.md' || mime.startsWith('text/')) {
    const text = cleanText(readFileSync(filePath, 'utf-8'));
    return { pages: [{ page: 1, text }], pageCount: 1 };
  }

  if (ext === '.pdf' || mime === 'application/pdf') {
    const { PDFParse } = await import('pdf-parse');
    const buffer = readFileSync(filePath);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    let pdfPages: { page: number; text: string }[] = [];
    let pdfTotal = 1;
    try {
      const result = await parser.getText();
      pdfPages = (result.pages ?? [])
        .map((p) => ({ page: p.num, text: cleanText(p.text) }))
        .filter((p) => p.text.length > 0);
      pdfTotal = result.total || pdfPages.length || 1;
    } finally {
      await parser.destroy().catch(() => undefined);
    }
    const totalLen = pdfPages.reduce((s, p) => s + p.text.length, 0);
    if (totalLen < 200) {
      const doclingPages = await tryDocling(filePath);
      if (doclingPages) return doclingPages;
      return { pages: [{ page: 1, text: '' }], pageCount: pdfTotal };
    }
    return { pages: pdfPages, pageCount: pdfTotal };
  }

  if (ext === '.docx' || mime.includes('wordprocessingml')) {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: filePath });
    const text = cleanText(result.value);
    return { pages: [{ page: 1, text }], pageCount: 1 };
  }

  if (ext === '.pptx' || mime.includes('presentationml')) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(readFileSync(filePath));
    const slideFiles = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => {
        const na = Number(a.match(/(\d+)\.xml$/)?.[1] ?? 0);
        const nb = Number(b.match(/(\d+)\.xml$/)?.[1] ?? 0);
        return na - nb;
      });
    const pages: { page: number; text: string }[] = [];
    let pageNum = 0;
    for (const name of slideFiles) {
      const xml = (await zip.files[name]?.async('string')) ?? '';
      const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1] ?? '');
      const joined = cleanText(texts.join('\n'));
      if (joined) pages.push({ page: ++pageNum, text: joined });
    }
    return { pages: pages.length > 0 ? pages : [{ page: 1, text: '' }], pageCount: pages.length };
  }

  throw new Error(`Định dạng không hỗ trợ cho RAG: ${ext}`);
}
async function tryDocling(filePath: string): Promise<ParsedDoc | null> {
  try {
    const { execFile } = await import('node:child_process');
    const outDir = filePath + '.docling-out';
    await new Promise<void>((resolve, reject) => {
      execFile('docling', ['--to', 'plain-text', '--output', outDir, filePath], { timeout: 120_000 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    const { readdirSync, readFileSync } = await import('node:fs');
    const files = readdirSync(outDir).filter((f) => f.endsWith('.txt') || f.endsWith('.md'));
    let combined = '';
    for (const f of files) combined += readFileSync(path.join(outDir, f), 'utf-8') + '\n\n';
    const cleaned = cleanText(combined);
    return cleaned.length > 0 ? { pages: [{ page: 1, text: cleaned }], pageCount: 1 } : null;
  } catch {
    return null;
  }
}