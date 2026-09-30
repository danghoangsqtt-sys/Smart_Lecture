import type multer from 'multer';

// Upload forms use flat, named text fields. Do not allow append-field to build
// nested objects or sparse arrays from attacker-controlled multipart names.
export function singleFileLimits(fileSize: number, fields: number): NonNullable<multer.Options['limits']> {
  return {
    fileSize,
    files: 1,
    fields,
    parts: fields + 1,
    fieldNameSize: 64,
    fieldSize: 4 * 1024,
    fieldNestingDepth: 0,
    fieldArrayIndexLimit: 0,
    headerPairs: 16,
  };
}
