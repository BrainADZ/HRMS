-- Membership metadata does not grant permissions or change existing roles.
ALTER TABLE role_assignments DROP CONSTRAINT role_assignments_role_check;
ALTER TABLE role_assignments ADD CHECK(role IN ('ceo','admin','head','manager','accounts','employee'));
ALTER TABLE role_assignments DROP CONSTRAINT role_assignments_check1;
ALTER TABLE role_assignments ADD CHECK(role IN ('head','manager','accounts') OR (vertical_id IS NULL AND department_id IS NULL));
ALTER TABLE role_permission_rules DROP CONSTRAINT role_permission_rules_role_check;
ALTER TABLE role_permission_rules ADD CHECK(role IN ('ceo','admin','head','manager','accounts','employee'));
CREATE TABLE employee_verticals(employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE, vertical_id INTEGER NOT NULL REFERENCES verticals(id), PRIMARY KEY(employee_id,vertical_id));
INSERT INTO employee_verticals SELECT id,vertical_id FROM employees WHERE vertical_id IS NOT NULL;
CREATE FUNCTION retain_primary_vertical() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF NEW.vertical_id IS NOT NULL THEN INSERT INTO employee_verticals VALUES(NEW.id,NEW.vertical_id) ON CONFLICT DO NOTHING; END IF;
RETURN NEW; END $$;
CREATE TRIGGER employee_primary_vertical AFTER INSERT OR UPDATE OF vertical_id ON employees FOR EACH ROW EXECUTE FUNCTION retain_primary_vertical();
