import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { extractResumeText, validateDocxArchive } from '../server/services/resume.js';
import { textPdf } from '../server/lib/pdf.js';

test('real PDF and DOCX resumes extract contact and experience text', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hrms-resume-'));
  try {
    const pdf = path.join(dir, 'resume.pdf');
    await fs.writeFile(pdf, textPdf('Asha Rao', ['asha@example.com', 'React developer with 6 years experience']));
    assert.match(await extractResumeText(pdf, '.pdf'), /asha@example.com/);
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Asha Rao asha@example.com React 6 years</w:t></w:r></w:p></w:body></w:document>');
    const docx = path.join(dir, 'resume.docx');
    await fs.writeFile(docx, await zip.generateAsync({ type: 'nodebuffer' }));
    assert.match(await extractResumeText(docx, '.docx'), /React 6 years/);
    const huge = new JSZip(); huge.file('word/document.xml', 'a'.repeat(21 * 1024 * 1024));
    const expanded = await huge.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    assert.throws(() => validateDocxArchive(expanded), /20 MB/);
    await fs.writeFile(path.join(dir, 'long.txt'), 'a'.repeat(200001));
    await assert.rejects(extractResumeText(path.join(dir, 'long.txt'), '.txt'), /character limit/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
