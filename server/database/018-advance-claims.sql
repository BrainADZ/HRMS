ALTER TABLE expense_advances ADD COLUMN IF NOT EXISTS disbursed_on TEXT;
ALTER TABLE expense_advances ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE expense_advances ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE expense_advances ADD COLUMN IF NOT EXISTS extra_claim_id INTEGER REFERENCES payroll_adjustments(id);
