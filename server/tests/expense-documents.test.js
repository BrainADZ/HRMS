import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, as } from './helpers.js';

test('Employees upload five personal document types; Corporate Accounts uploads official documents; download scope remains private', async () => {
  const ctx = await boot();
  try {
    const employee = await as(ctx.base, 'aarav.mehta@brainadz.com');
    const accounts = await as(ctx.base, 'vikram.patel@brainadz.com');
    const admin = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const owner = await ctx.db.get("SELECT * FROM users WHERE email='aarav.mehta@brainadz.com'");
    const uploader = await ctx.db.get(
      "SELECT * FROM users WHERE email='vikram.patel@brainadz.com'",
    );
    const dept = await ctx.db.value("SELECT id FROM departments WHERE name='Finance'");
    const vertical = await ctx.db.value("SELECT id FROM verticals WHERE name='Corporate'");
    const form = (category) => {
      const f = new FormData();
      if (category) f.append('category', category);
      f.append('file', new Blob(['%PDF-1.4\ndocument'], { type: 'application/pdf' }), 'letter.pdf');
      return f;
    };
    assert.equal(
      (
        await employee.post(`/employees/${owner.employee_id}/documents`, undefined, {
          form: form(),
        })
      ).status,
      403,
    );
    assert.equal(
      (await admin.post(`/employees/${owner.employee_id}/documents`, undefined, { form: form() }))
        .status,
      403,
    );
    await ctx.db.update('employees', uploader.employee_id, {
      department_id: dept,
      vertical_id: vertical,
    });
    assert.equal((await accounts.get('/meta')).body.canUploadDocuments, true);
    const personal = ['Aadhaar Card', 'PAN Card', 'Address Proof', 'Education', 'Bank Proof'];
    assert.deepEqual((await employee.get('/meta')).body.selfUploadDocumentCategories, personal);
    for (const category of personal) {
      const own = await employee.post(`/employees/${owner.employee_id}/documents`, undefined, {
        form: form(category),
      });
      assert.equal(own.status, 200, category + JSON.stringify(own.body));
      assert.equal((await employee.get(`/documents/${own.body.id}/download`)).status, 200);
      assert.equal(
        (
          await employee.post(`/employees/${uploader.employee_id}/documents`, undefined, {
            form: form(category),
          })
        ).status,
        403,
      );
    }
    for (const category of [
      'Offer Letter',
      'Appointment Letter',
      'Other',
      'Experience',
      'ID Proof',
      'Payslip',
    ]) {
      assert.equal(
        (
          await employee.post(`/employees/${owner.employee_id}/documents`, undefined, {
            form: form(category),
          })
        ).status,
        403,
        category,
      );
    }

    const uploaded = await accounts.post(`/employees/${owner.employee_id}/documents`, undefined, {
      form: form('Offer Letter'),
    });
    assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
    assert.equal(
      (
        await accounts.post(`/employees/${owner.employee_id}/documents`, undefined, {
          form: form('Appointment Letter'),
        })
      ).status,
      200,
    );
    const url = `/documents/${uploaded.body.id}/download`;
    assert.equal((await employee.get(url)).status, 200);
    assert.equal((await admin.get(url)).status, 200);
    assert.equal((await accounts.get(url)).status, 403);
    assert.equal((await employee.del(`/documents/${uploaded.body.id}`)).status, 403);
    const otherVertical = await ctx.db.value(
      "SELECT id FROM verticals WHERE name!='Corporate' LIMIT 1",
    );
    await ctx.db.update('employees', uploader.employee_id, { vertical_id: otherVertical });
    assert.equal(
      (
        await accounts.post(`/employees/${owner.employee_id}/documents`, undefined, {
          form: form(),
        })
      ).status,
      403,
    );
  } finally {
    await ctx.close();
  }
});

test('bulk expenses preserve separate purposes and private attachments with Accounts decisions and notifications', async () => {
  const ctx = await boot();
  try {
    const employee = await as(ctx.base, 'aarav.mehta@brainadz.com');
    const accounts = await as(ctx.base, 'vikram.patel@brainadz.com');
    const admin = await as(ctx.base, 'rajiv.malhotra@brainadz.com');
    const uploader = await ctx.db.get(
      "SELECT * FROM users WHERE email='vikram.patel@brainadz.com'",
    );
    await ctx.db.update('employees', uploader.employee_id, {
      department_id: await ctx.db.value("SELECT id FROM departments WHERE name='Finance'"),
    });
    const T = (await employee.get('/meta')).body.today;
    const form = new FormData();
    form.append(
      'entries',
      JSON.stringify(
        ['Client taxi', 'Office supplies'].map((purpose, i) => ({
          purpose,
          amount: 150 + i,
          category: 'Travel',
          start_date: T,
          end_date: T,
          files: [i],
        })),
      ),
    );
    for (let i = 0; i < 2; i++)
      form.append(
        'proofs',
        new Blob(['%PDF-1.4\nreceipt'], { type: 'application/pdf' }),
        `receipt${i}.pdf`,
      );
    const result = await employee.post('/expenses', undefined, { form });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.ids.length, 2);
    const claim = result.body.ids[0];
    assert.equal((await employee.get(`/expenses/${claim}/attachments/0`)).status, 200);
    assert.equal((await employee.put(`/expenses/${claim}`, { status: 'Approved' })).status, 403);
    assert.equal((await accounts.put(`/expenses/${claim}`, { status: 'Approved' })).status, 200);
    assert.equal((await admin.put(`/expenses/${claim}`, { status: 'Rejected' })).status, 409);
    const owner = await ctx.db.get("SELECT * FROM users WHERE email='aarav.mehta@brainadz.com'");
    assert.ok(
      await ctx.db.value(
        "SELECT COUNT(*) FROM notifications WHERE user_id=? AND text LIKE '%approved%'",
        owner.id,
      ),
    );
    const adminId = await ctx.db.value(
      "SELECT id FROM users WHERE email='rajiv.malhotra@brainadz.com'",
    );
    assert.ok(
      await ctx.db.value(
        "SELECT COUNT(*) FROM notifications WHERE user_id=? AND text LIKE '%approved%'",
        adminId,
      ),
    );
  } finally {
    await ctx.close();
  }
});
