import fs from 'node:fs';
import path from 'node:path';
import { fail } from '../core.js';

export const uploadedFiles = (req) =>
  [
    req.file,
    ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat()),
  ].filter(Boolean);
export function cleanUploads(req) {
  for (const file of uploadedFiles(req)) if (file.path) fs.rmSync(file.path, { force: true });
}
export function validateUploads(req) {
  for (const file of uploadedFiles(req)) {
    const ext = path.extname(file.originalname).toLowerCase();
    const header = Buffer.alloc(512),
      fd = fs.openSync(file.path, 'r');
    let size;
    try {
      size = fs.readSync(fd, header, 0, header.length, 0);
    } finally {
      fs.closeSync(fd);
    }
    const bytes = header.subarray(0, size),
      hex = bytes.toString('hex');
    const checks = {
      '.pdf': () => bytes.toString('latin1').startsWith('%PDF-'),
      '.png': () => hex.startsWith('89504e470d0a1a0a'),
      '.jpg': () => hex.startsWith('ffd8ff'),
      '.jpeg': () => hex.startsWith('ffd8ff'),
      '.webp': () =>
        bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
      '.docx': () => hex.startsWith('504b0304'),
      '.xlsx': () => hex.startsWith('504b0304'),
      '.doc': () => hex.startsWith('d0cf11e0a1b11ae1'),
      '.xls': () => hex.startsWith('d0cf11e0a1b11ae1'),
      '.txt': () => !bytes.includes(0),
    };
    if (!size || (checks[ext] && !checks[ext]()))
      fail(400, 'The file contents do not match its file type, or the file is empty');
  }
}
export function authorizeEmployeeUpload(db, { allowHr = true } = {}) {
  return async (req, _res, next) => {
    const employeeId = Number(req.params.id);
    if (
      req.user.role !== 'admin' &&
      !(allowHr && req.user.role === 'hr') &&
      req.user.employeeId !== employeeId
    )
      fail(403, 'You can only upload your own files');
    if (!(await db.value('SELECT id FROM employees WHERE id=?', employeeId)))
      fail(404, 'Employee not found');
    next();
  };
}
export const authorizePolicyUpload = (req, _res, next) => {
  if (!['admin', 'hr'].includes(req.user.role)) fail(403, 'Only HR can upload policies');
  next();
};
