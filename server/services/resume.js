// Text extraction for uploaded resumes (PDF, DOCX, TXT).
import fs from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';

export const RESUME_EXTS = ['.pdf', '.docx', '.txt'];
const checkedText = (text) => {
  const result = String(text || '').trim();
  if (result.length > 200000) throw new Error('Resume text exceeds the 200,000 character limit');
  return result;
};

// Inspect the ZIP directory before Mammoth inflates DOCX entries. A small
// compressed upload must not expand into an unbounded in-memory document.
export function validateDocxArchive(buffer) {
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50 && offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) { end = offset; break; }
  }
  if (end < 0) throw new Error('Invalid DOCX ZIP directory');
  const entries = buffer.readUInt16LE(end + 10), directorySize = buffer.readUInt32LE(end + 12);
  let offset = buffer.readUInt32LE(end + 16), expanded = 0;
  if (entries > 2000 || offset + directorySize > end) throw new Error('DOCX archive is too complex');
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid DOCX archive entry');
    if (buffer.readUInt16LE(offset + 8) & 1) throw new Error('Encrypted DOCX files are not supported');
    expanded += buffer.readUInt32LE(offset + 24);
    if (expanded > 20 * 1024 * 1024) throw new Error('Expanded DOCX exceeds the 20 MB limit');
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  if (offset > end) throw new Error('Invalid DOCX directory size');
}

export async function extractResumeText(filePath, ext) {
  const buf = await fs.readFile(filePath);
  if (buf.length > 10 * 1024 * 1024) throw new Error('Resume exceeds the 10 MB size limit');
  if (ext === '.pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    try {
      if (pdf.numPages > 100) throw new Error('Resume exceeds the 100 page limit');
      const { text } = await extractText(pdf, { mergePages: true });
      return checkedText(String(text || '').replace(/[ \t]+\n/g, '\n'));
    } finally { await pdf.loadingTask.destroy(); }
  }
  if (ext === '.docx') {
    validateDocxArchive(buf);
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return checkedText(value);
  }
  if (ext === '.txt') return checkedText(buf.toString('utf8'));
  throw new Error(`Unsupported resume format ${ext}`);
}
