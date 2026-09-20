/**
 * Applies every SQL file in migrations/ exactly once, in filename order.
 *
 *   pnpm migrate
 *
 * Reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN from .dev.vars (or the process
 * environment). Start a local server first with `turso dev -f local.db`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDb } from '../src/lib/db-client';
import { loadEnv, projectRoot, requireEnv } from './_shared';

async function main() {
  const env = loadEnv();
  const url = requireEnv(env, 'TURSO_DATABASE_URL');
  const token = env.TURSO_AUTH_TOKEN ?? '';
  const db = createDb(url, token);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    (await db.execute('SELECT filename FROM schema_migrations')).rows.map((row) => String(row.filename)),
  );

  const dir = join(projectRoot, 'migrations');
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip   ${file}`);
      continue;
    }
    const sql = readFileSync(join(dir, file), 'utf8');
    await db.executeMultiple(sql);
    await db.execute({ sql: 'INSERT INTO schema_migrations (filename) VALUES (?)', args: [file] });
    console.log(`apply  ${file}`);
    ran++;
  }

  const count = (await db.execute('SELECT count(*) AS n FROM users')).rows[0]?.n ?? 0;
  console.log(`\nDone. ${ran} migration(s) applied. users table has ${count} row(s).`);
  console.log(`Connected to ${url}`);
}

main().catch((error) => {
  console.error('\nMigration failed:');
  console.error(error);
  process.exit(1);
});
