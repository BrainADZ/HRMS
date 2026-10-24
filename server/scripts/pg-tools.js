import fs from 'node:fs/promises';
import path from 'node:path';

export async function pgTool(name) {
  const override = process.env[name.toUpperCase().replace('-', '_') + '_PATH'];
  if (override) return override;
  if (process.platform === 'win32') {
    const root = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL');
    for (const version of (await fs.readdir(root).catch(() => [])).sort(
      (a, b) => Number(b) - Number(a),
    )) {
      const candidate = path.join(root, version, 'bin', name + '.exe');
      if (await fs.stat(candidate).catch(() => null)) return candidate;
    }
  }
  return name;
}

export function pgEnvironment(config, database) {
  const url = new URL(config.connectionString);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGDATABASE: database || decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE:
      process.env.PGSSLMODE ||
      new URL(process.env.DATABASE_URL || config.connectionString).searchParams.get('sslmode') ||
      'disable',
  };
}
