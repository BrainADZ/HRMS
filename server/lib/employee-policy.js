// Ownership is separate from admin access: HR and other admins still track their work.
export function isCompanyOwner(employee) {
  return /^(ceo|chief executive officer|owner|company owner|business owner)$/i.test(
    String(employee?.designation || '').trim(),
  );
}
