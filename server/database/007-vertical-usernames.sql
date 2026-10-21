-- Keep the original two-argument rule for Corporate/unassigned employees.
CREATE OR REPLACE FUNCTION hrms_employee_username(first_name TEXT, employee_code TEXT, vertical_short TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE WHEN lower(vertical_short) IN ('live', 'marketing', 'exhibits') THEN
    COALESCE(NULLIF(regexp_replace(first_name, '[^a-zA-Z0-9]', '', 'g'), ''), 'Employee')
    || CASE lower(vertical_short) WHEN 'live' THEN 'BZL' WHEN 'marketing' THEN 'BZM' ELSE 'BZE' END
    || COALESCE(substring(employee_code FROM '[0-9]+$'), regexp_replace(employee_code, '[^a-zA-Z0-9]', '', 'g'))
  ELSE hrms_employee_username(first_name, employee_code) END;
$$;

CREATE OR REPLACE FUNCTION hrms_set_username() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.role = 'admin' THEN
    NEW.username := NULL;
  ELSE
    SELECT hrms_employee_username(e.first_name, e.code, v.short) INTO NEW.username
      FROM employees e LEFT JOIN verticals v ON v.id = e.vertical_id
      WHERE e.id = NEW.employee_id;
    IF NEW.username IS NULL THEN
      RAISE EXCEPTION 'Non-administrator logins must be linked to an employee'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION hrms_refresh_username() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- The users trigger calculates the new username using the updated vertical.
  UPDATE users SET username = username WHERE employee_id = NEW.id AND role != 'admin';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS employees_refresh_username ON employees;
CREATE TRIGGER employees_refresh_username AFTER UPDATE OF first_name, code, vertical_id
  ON employees FOR EACH ROW EXECUTE FUNCTION hrms_refresh_username();

UPDATE users SET username = username WHERE role != 'admin';
