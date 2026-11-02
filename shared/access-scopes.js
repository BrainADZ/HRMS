// Scope is attached to a responsibility, never borrowed from another role.
export const ACCESS_SCOPES = [
  { value: 'own', label: 'Own records only' },
  { value: 'team', label: 'Reporting team' },
  { value: 'selected', label: 'Selected department / vertical' },
  { value: 'all', label: 'All employees' },
];
export function defaultScope(role) {
  return ['ceo', 'admin', 'accounts'].includes(role)
    ? 'all'
    : ['head', 'manager'].includes(role)
      ? 'team'
      : 'own';
}
export function scopeLabel(row) {
  return ACCESS_SCOPES.find((s) => s.value === row.access_scope)?.label || 'Existing scope';
}
// These workflows already enforce employee scope in their domain handlers.
// Organization configuration and other company-wide actions require All employees.
export function supportsLimitedScope(key) {
  return /^(employees\.(view|team)|attendance\.(view|edit|approve|export|team)|leave\.(view|approve|export|approve_team)|performance\.(view|approve|team)|training\.(view|team)|resignations\.(view|approve|team))$/.test(
    key,
  );
}
