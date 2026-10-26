export const SELF_UPLOAD_DOCUMENTS = [
  'Aadhaar Card',
  'PAN Card',
  'Address Proof',
  'Education',
  'Bank Proof',
];

export async function canUploadDocuments(db, user) {
  if (!user?.employeeId) return false;
  return Boolean(
    await db.value(
      `SELECT e.id FROM employees e
    JOIN departments d ON d.id=e.department_id JOIN verticals v ON v.id=e.vertical_id
    WHERE e.id=? AND e.status!='Exited'
    AND LOWER(TRIM(v.name)) IN ('corporate','brainadz corporate')
    AND LOWER(TRIM(d.name)) IN ('accounts','finance','accounting','accounts & finance','finance & accounts')`,
      user.employeeId,
    ),
  );
}
