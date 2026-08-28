import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';

export type SpreadsheetCell = string | number | boolean | Date;
export type SpreadsheetRows = readonly (readonly SpreadsheetCell[])[];

function toScalar(value: unknown): SpreadsheetCell {
  if (value instanceof Date || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (!value || typeof value !== 'object') return '';

  const cell = value as Record<string, unknown>;
  if (cell.result !== undefined && cell.result !== null) return toScalar(cell.result);
  if (typeof cell.text === 'string') return cell.text;
  if (Array.isArray(cell.richText)) {
    return cell.richText
      .map((part) => (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string' ? (part as Record<string, string>).text : ''))
      .join('');
  }
  return '';
}

/** Reads only the first worksheet and removes ExcelJS-specific cell objects. */
export async function readFirstWorksheetRows(buffer: Buffer, format: 'csv' | 'xlsx' = 'xlsx'): Promise<SpreadsheetCell[][]> {
  const workbook = new ExcelJS.Workbook();
  const stream = Readable.from([buffer]);
  if (format === 'csv') await workbook.csv.read(stream);
  else await workbook.xlsx.read(stream);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('File không có sheet nào');

  const rows: SpreadsheetCell[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const cells = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push(cells.map(toScalar));
  });
  return rows;
}

export async function createXlsxBuffer(sheetName: string, rows: SpreadsheetRows, widths: readonly number[] = []): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRows(rows.map((row) => [...row]));
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function escapeCsvCell(value: SpreadsheetCell): string {
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

export function createCsvBuffer(rows: SpreadsheetRows): Buffer {
  const contents = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  return Buffer.from(`\uFEFF${contents}`, 'utf8');
}
