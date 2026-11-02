CREATE TABLE attendance_verifications (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('P','A','HD','L')),
  note TEXT,
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_by_name TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE(employee_id, date)
);
CREATE TABLE attendance_verification_history (
  id SERIAL PRIMARY KEY,
  verification_id INTEGER NOT NULL REFERENCES attendance_verifications(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  note TEXT,
  verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verified_by_name TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  revision INTEGER NOT NULL
);
CREATE INDEX attendance_verifications_date_idx ON attendance_verifications(date);
