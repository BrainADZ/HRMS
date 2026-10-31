ALTER TABLE attendance ADD COLUMN auto_absent INTEGER NOT NULL DEFAULT 0 CHECK (auto_absent IN (0,1));
ALTER TABLE hour_shortfalls ADD COLUMN kind TEXT NOT NULL DEFAULT 'short_hours' CHECK (kind IN ('short_hours','absence'));
