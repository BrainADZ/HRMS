-- Preserve saved decisions as ordinary attendance marks before retiring the workflow.
-- Historical verification and audit tables remain intact.
INSERT INTO attendance(employee_id,date,status,note,updated_by,auto_absent)
SELECT employee_id,date,status,note,verified_by,0 FROM attendance_verifications WHERE status IN ('P','A','HD')
ON CONFLICT(employee_id,date) DO UPDATE SET status=excluded.status,note=excluded.note,updated_by=excluded.updated_by,auto_absent=0;
