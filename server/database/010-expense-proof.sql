ALTER TABLE payroll_adjustments ADD COLUMN IF NOT EXISTS proof_file TEXT;
ALTER TABLE payroll_adjustments ADD COLUMN IF NOT EXISTS proof_name TEXT;
