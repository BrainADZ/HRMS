-- Standalone administrators also have a profile photo without requiring a
-- fictional employee record. Employee-linked accounts use the employee photo.
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo TEXT;
