import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { MEDIA_DIR } from '../config.js';

export async function convertPptxToPdf(absoluteInputPath: string): Promise<{ pdfPath: string; sizeBytes: number } | null> {
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        'soffice',
        ['--headless', '--convert-to', 'pdf', '--outdir', MEDIA_DIR, absoluteInputPath],
        { timeout: 120_000 },
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    const base = path.basename(absoluteInputPath, path.extname(absoluteInputPath));
    const pdfPath = path.join(MEDIA_DIR, `${base}.pdf`);
    if (!existsSync(pdfPath)) return null;
    return { pdfPath, sizeBytes: statSync(pdfPath).size };
  } catch {
    return null;
  }
}
