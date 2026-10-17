export const identifier = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error('Invalid database identifier');
  return `"${name}"`;
};
function bindable(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value !== null && typeof value === 'object' && !(value instanceof Uint8Array)) return JSON.stringify(value);
  return value;
}
// Translate parameters only, leaving SQL strings and comments intact.
export function prepareQuery(sql, params = []) {
  let index = 0;
  const text = sql.replace(/('(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\$([a-z_][a-z0-9_]*)?\$[\s\S]*?\$\2\$)|(\?)/gi,
    (match, quoted, _tag, parameter) => parameter ? `$${++index}` : match);
  const values = (params.length === 1 && Array.isArray(params[0]) ? params[0] : params).map(bindable);
  if (index !== values.length) throw new Error(`Database parameter count mismatch: expected ${index}, received ${values.length}`);
  return { text, values };
}
