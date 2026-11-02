-- Some databases already recorded version 24 for the company leave policy,
-- before the master-admin migration reused that version. Repair those installs
-- under a new version without changing existing account privileges or data.
ALTER TABLE users ADD COLUMN IF NOT EXISTS master_admin INTEGER NOT NULL DEFAULT 0;
