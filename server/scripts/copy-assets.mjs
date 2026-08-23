import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('../dist/db', import.meta.url), { recursive: true });
copyFileSync(
  new URL('../src/db/schema.sql', import.meta.url),
  new URL('../dist/db/schema.sql', import.meta.url)
);
console.log('[build] schema.sql copied to dist/db/');
