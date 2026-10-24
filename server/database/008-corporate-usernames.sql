CREATE OR REPLACE FUNCTION hrms_employee_username(first_name TEXT, employee_code TEXT, vertical_short TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE WHEN lower(vertical_short) IN ('live', 'marketing', 'exhibits', 'corporate') THEN
    COALESCE(NULLIF(regexp_replace(first_name, '[^a-zA-Z0-9]', '', 'g'), ''), 'Employee')
    || CASE lower(vertical_short)
      WHEN 'live' THEN 'BZL'
      WHEN 'marketing' THEN 'BZM'
      WHEN 'exhibits' THEN 'BZE'
      ELSE 'BZ'
    END
    || COALESCE(substring(employee_code FROM '[0-9]+$'), regexp_replace(employee_code, '[^a-zA-Z0-9]', '', 'g'))
  ELSE hrms_employee_username(first_name, employee_code) END;
$$;

UPDATE users SET username = username WHERE role != 'admin';
