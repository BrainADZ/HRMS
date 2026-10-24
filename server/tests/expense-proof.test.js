import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boot, as } from './helpers.js';

test('expense proof uploads persist, are private, and invalid uploads are cleaned up', async () => {
  const ctx = await boot();
  try {
    const employee = await as(ctx.base, 'aarav.mehta@brainadz.com');
    const other = await as(ctx.base, 'vikram.patel@brainadz.com');
    const admin = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const form = new FormData();
    form.append('amount', '450');
    form.append('note', 'Taxi receipt');
    form.append(
      'proof',
      new Blob(['%PDF-1.4\nexpense receipt'], { type: 'application/pdf' }),
      'receipt.pdf',
    );
    const result = await employee.post('/payroll/adjustments', undefined, { form });
    assert.equal(result.status, 200);
    const claim = await ctx.db.get(
      'SELECT * FROM payroll_adjustments WHERE id = ?',
      result.body.id,
    );
    assert.equal(claim.proof_name, 'receipt.pdf');
    assert.equal(claim.status, 'Pending');
    const url = `/payroll/adjustments/${claim.id}/proof`;
    assert.equal((await employee.get(url)).status, 200);
    assert.equal((await admin.get(url)).status, 200);
    assert.equal((await other.get(url)).status, 403);
    const dir = path.join(ctx.dir, 'uploads', 'expense-proofs');
    const files = fs.readdirSync(dir);
    const invalid = new FormData();
    invalid.append('amount', '50');
    invalid.append('proof', new Blob(['not a PDF']), 'fake.pdf');
    assert.equal(
      (await employee.post('/payroll/adjustments', undefined, { form: invalid })).status,
      400,
    );
    assert.deepEqual(fs.readdirSync(dir), files);
    const noProof = await employee.post('/payroll/adjustments', {
      amount: 150,
      note: 'No receipt',
    });
    assert.equal(noProof.status, 200);
    assert.equal((await employee.get(`/payroll/adjustments/${noProof.body.id}/proof`)).status, 404);
  } finally {
    await ctx.close();
  }
});
