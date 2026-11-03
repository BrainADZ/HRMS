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


DROP TRIGGER IF EXISTS users_generate_username ON users;
CREATE TRIGGER users_generate_username BEFORE INSERT OR UPDATE OF employee_id,role,username ON users FOR EACH ROW EXECUTE FUNCTION hrms_set_username();
ALTER TABLE users DROP COLUMN IF EXISTS managed_username;
ALTER TABLE users DROP COLUMN IF EXISTS credential_role;
