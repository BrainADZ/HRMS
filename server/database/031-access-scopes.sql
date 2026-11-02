ALTER TABLE role_assignments ADD COLUMN access_scope TEXT NOT NULL DEFAULT 'legacy' CHECK(access_scope IN ('legacy','own','team','selected','all'));
ALTER TABLE role_assignments DROP CONSTRAINT role_assignments_check1;
ALTER TABLE role_assignments ADD CHECK(access_scope='legacy' OR access_scope='selected' OR (vertical_id IS NULL AND department_id IS NULL));
ALTER TABLE role_assignments ADD CHECK(access_scope!='selected' OR vertical_id IS NOT NULL OR department_id IS NOT NULL);
UPDATE permission_state SET revision=revision+1;
