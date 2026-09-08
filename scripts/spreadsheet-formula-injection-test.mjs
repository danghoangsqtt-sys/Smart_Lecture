/**
 * Formula-injection regression test for the shared spreadsheet export utility.
 *
 * server/src/routes/games.routes.ts already had its own local `spreadsheetSafeText()`
 * escaping applied only to the circuit-debrief export. Every OTHER caller of
 * createCsvBuffer()/createXlsxBuffer() — classes.routes.ts's student-list export
 * (student display_name, gradebook remark), teachingLogs.routes.ts, and
 * teachingPlans.routes.ts — wrote user-controlled string cells straight through with
 * no escaping at all. A teacher/admin display_name or gradebook remark starting with
 * `=`, `+`, `-`, or `@` would be evaluated as a formula the moment another
 * teacher/admin opened the exported file in Excel/LibreOffice (classic CSV/XLSX
 * injection). The fix moved the escaping into the shared createCsvBuffer/
 * createXlsxBuffer functions themselves so every current and future caller is
 * covered by construction, and removed the now-redundant per-call escaping in
 * games.routes.ts. This test exercises the shared functions directly (would fail
 * against the pre-fix versions, which passed the malicious cell through untouched)
 * and also proves legitimate negative numbers are left alone.
 */
import { createCsvBuffer, createXlsxBuffer, readFirstWorksheetRows } from '../server/dist/utils/spreadsheet.js';

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.error(`  FAIL  ${name}`); }
}

console.log('=== spreadsheet formula-injection regression test ===');

const maliciousCells = ['=1+1', '+CMD|calc', '-2+3', '@SUM(A1:A9)'];
const rows = [['Header'], ...maliciousCells.map((cell) => [cell, -5])];

const csvText = createCsvBuffer(rows).toString('utf8');
const csvLines = csvText.replace(/^﻿/, '').split('\r\n');
for (const cell of maliciousCells) {
  check(`CSV neutralizes "${cell}"`, csvLines.some((line) => line.startsWith(`'${cell},`)));
}
check('CSV leaves a legitimate negative number untouched', csvLines.some((line) => line.endsWith(',-5')));

const xlsxBuffer = await createXlsxBuffer('Sheet1', rows);
const xlsxRows = await readFirstWorksheetRows(xlsxBuffer, 'xlsx');
for (const cell of maliciousCells) {
  check(`XLSX neutralizes "${cell}"`, xlsxRows.some((row) => row[0] === `'${cell}`));
}
check('XLSX leaves a legitimate negative number untouched', xlsxRows.some((row) => row[1] === -5));

console.log(`Formula-injection regression result: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
