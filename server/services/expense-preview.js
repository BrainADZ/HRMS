import fs from 'node:fs/promises';
import path from 'node:path';
import { validateDocxArchive } from './resume.js';

export async function expenseDocumentPreview(filePath, name) {
  const buffer = await fs.readFile(filePath);
  if (buffer.length > 10 * 1024 * 1024)
    throw new Error('This document exceeds the preview size limit.');
  const ext = path.extname(name).toLowerCase();
  if (ext === '.docx') {
    validateDocxArchive(buffer);
    const { default: mammoth } = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer });
    return { kind: 'text', text: value.slice(0, 200000), truncated: value.length > 200000 };
  }
  if (ext === '.doc') {
    const { default: WordExtractor } = await import('word-extractor');
    const doc = await new WordExtractor().extract(buffer);
    const text = doc.getBody();
    return { kind: 'text', text: text.slice(0, 200000), truncated: text.length > 200000 };
  }
  if (ext === '.xlsx') {
    validateDocxArchive(buffer);
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    return {
      kind: 'spreadsheet',
      sheets: book.worksheets.slice(0, 10).map((sheet) => {
        const rows = [];
        sheet.eachRow((row, number) => {
          if (rows.length >= 500) return;
          const cells = [];
          for (let i = 1; i <= Math.min(sheet.columnCount, 50); i++)
            cells.push(row.getCell(i).text.slice(0, 2000));
          rows.push({ number, cells });
        });
        return {
          name: sheet.name,
          rows,
          truncated: sheet.rowCount > 500 || sheet.columnCount > 50,
        };
      }),
      truncated: book.worksheets.length > 10,
    };
  }
  throw new Error('Preview is not available for this file format.');
}
