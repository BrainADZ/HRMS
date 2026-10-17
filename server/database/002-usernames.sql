ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

CREATE OR REPLACE FUNCTION hrms_employee_username(first_name TEXT, employee_code TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT AS $$
  SELECT COALESCE(NULLIF(regexp_replace(lower(first_name), '[^a-z0-9]', '', 'g'), ''), 'employee')
         || regexp_replace(lower(employee_code), '[^a-z0-9]', '', 'g');
$$;

UPDATE users u SET username = CASE WHEN u.role = 'admin' THEN NULL
  ELSE hrms_employee_username(e.first_name, e.code) END
FROM employees e WHERE e.id = u.employee_id;
UPDATE users SET username = NULL WHERE role = 'admin';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci ON users (LOWER(username));
ALTER TABLE users ADD CONSTRAINT users_login_identity CHECK (
  (role = 'admin' AND username IS NULL) OR
  (role != 'admin' AND employee_id IS NOT NULL AND username IS NOT NULL AND username != '')
);

-- Generate credentials consistently for manual hires, converted candidates,
-- bulk account creation, role changes, imports and existing employees.
CREATE OR REPLACE FUNCTION hrms_set_username() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'admin' THEN
    NEW.username := NULL;
  ELSE
    SELECT hrms_employee_username(e.first_name, e.code) INTO NEW.username
      FROM employees e WHERE e.id = NEW.employee_id;
    IF NEW.username IS NULL THEN
      RAISE EXCEPTION 'Non-administrator logins must be linked to an employee'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_generate_username BEFORE INSERT OR UPDATE OF employee_id, role, username
  ON users FOR EACH ROW EXECUTE FUNCTION hrms_set_username();

CREATE OR REPLACE FUNCTION hrms_refresh_username() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users SET username = hrms_employee_username(NEW.first_name, NEW.code)
    WHERE employee_id = NEW.id AND role != 'admin';
  RETURN NEW;
END;
$$;
CREATE TRIGGER employees_refresh_username AFTER UPDATE OF first_name, code
  ON employees FOR EACH ROW EXECUTE FUNCTION hrms_refresh_username();
