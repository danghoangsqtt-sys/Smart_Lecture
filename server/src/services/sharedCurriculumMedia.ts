import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, copyFileSync, existsSync, lstatSync, openSync, readSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { MEDIA_DIR } from '../config.js';
import { db } from '../db/connection.js';
import { HttpError } from '../utils/errors.js';

type LegacyFile = { file_path: string | null; size_bytes: number };
type SharedFile = { id: string; file_path: string | null; asset_status: string; type: string };

function safeMediaPath(filename: string): string {
  if (path.basename(filename) !== filename || filename === '.' || filename === '..') {
    throw new HttpError(409, 'UNSAFE_MEDIA_PATH', 'Đường dẫn học liệu không hợp lệ');
  }
  return path.join(MEDIA_DIR, filename);
}

function digest(filename: string): string {
  const hash = createHash('sha256');
  const fd = openSync(filename, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let size = readSync(fd, buffer, 0, buffer.length, null);
    while (size > 0) {
      hash.update(buffer.subarray(0, size));
      size = readSync(fd, buffer, 0, buffer.length, null);
    }
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

export function matchesMediaSignature(filename: string, extension: string): boolean {
  const fd = openSync(filename, 'r');
  const header = Buffer.alloc(16);
  let size: number;
  try { size = readSync(fd, header, 0, header.length, 0); } finally { closeSync(fd); }
  const magic = header.subarray(0, size);
  switch (extension.toLowerCase()) {
    case '.pdf': return magic.subarray(0, 5).equals(Buffer.from('%PDF-'));
    case '.docx':
    case '.pptx': return magic.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    case '.png': return magic.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case '.jpg':
    case '.jpeg': return magic.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    case '.mp4': return magic.subarray(4, 8).toString() === 'ftyp';
    case '.webm': return magic.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    default: return false;
  }
}

export function copyLegacyMaterial(materialId: string): SharedFile {
  const shared = db.prepare('SELECT id, file_path, asset_status, type FROM shared_lesson_materials WHERE id = ?')
    .get(materialId) as SharedFile | undefined;
  if (!shared) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy học liệu');
  if (shared.asset_status === 'ready') return shared;
  if (shared.type === 'link') throw new HttpError(409, 'NO_FILE', 'Liên kết không có tệp cần sao chép');
  const sourceId = db.prepare(`SELECT source_id FROM shared_curriculum_legacy_map
    WHERE source_kind = 'material' AND target_kind = 'material' AND target_id = ?`).get(materialId) as { source_id: string } | undefined;
  if (!sourceId) throw new HttpError(409, 'NO_LEGACY_SOURCE', 'Học liệu này không có nguồn cũ');
  const source = db.prepare('SELECT file_path, size_bytes FROM materials WHERE id = ?').get(sourceId.source_id) as LegacyFile | undefined;
  if (!source?.file_path) throw new HttpError(409, 'SOURCE_MISSING', 'Tệp nguồn cũ không còn trong dữ liệu');
  const sourcePath = safeMediaPath(source.file_path);
  if (!existsSync(sourcePath)) throw new HttpError(409, 'SOURCE_MISSING', 'Tệp nguồn cũ không còn trên đĩa');
  const stat = lstatSync(sourcePath);
  if (!stat.isFile() || (source.size_bytes > 0 && stat.size !== source.size_bytes)) {
    throw new HttpError(409, 'SOURCE_CHANGED', 'Kích thước tệp nguồn không khớp dữ liệu');
  }
  if (!matchesMediaSignature(sourcePath, path.extname(source.file_path))) {
    throw new HttpError(409, 'SOURCE_FORMAT', 'Định dạng tệp nguồn không khớp phần mở rộng');
  }
  const filename = `${randomUUID()}${path.extname(source.file_path).toLowerCase()}`;
  const targetPath = safeMediaPath(filename);
  try {
    copyFileSync(sourcePath, targetPath, constants.COPYFILE_EXCL);
    const copied = statSync(targetPath);
    if (copied.size !== stat.size || digest(sourcePath) !== digest(targetPath)) {
      throw new HttpError(409, 'COPY_MISMATCH', 'Bản sao học liệu không khớp nguồn');
    }
    db.prepare(`UPDATE shared_lesson_materials SET file_path = ?, size_bytes = ?, asset_status = 'ready'
      WHERE id = ? AND asset_status = 'pending_copy'`).run(filename, copied.size, materialId);
  } catch (error) {
    if (existsSync(targetPath)) unlinkSync(targetPath);
    throw error;
  }
  return db.prepare('SELECT id, file_path, asset_status, type FROM shared_lesson_materials WHERE id = ?')
    .get(materialId) as SharedFile;
}

export function sharedMediaPath(filename: string): string {
  return safeMediaPath(filename);
}
