/**
 * Seeds (or updates) the single admin user.
 *
 *   pnpm create-admin you@mail.example.com "correct horse battery staple" "Your Name"
 *
 * The display name is optional and is used in the From header of outgoing mail.
 * Reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN from .dev.vars (or the process
 * environment). There is intentionally no public sign-up page: a self-hosted
 * single-owner mailbox is bootstrapped from the CLI.
 */
import { createDb } from '../src/lib/db-client';
import { hashPassword } from '../src/lib/password';
import { loadEnv, requireEnv } from './_shared';

async function main() {
  const args = process.argv.slice(2);
  const email = (args[0] ?? '').trim().toLowerCase();
  const password = args[1] ?? '';
  const displayName = (args[2] ?? '').trim() || null;

  if (!email || !password) {
    console.error('Usage: pnpm create-admin <email> <password> ["Display Name"]');
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`"${email}" does not look like an email address.`);
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Choose a password of at least 12 characters.');
    process.exit(1);
  }

  const env = loadEnv();
  const url = requireEnv(env, 'TURSO_DATABASE_URL');
  const db = createDb(url, env.TURSO_AUTH_TOKEN ?? '');
  const passwordHash = await hashPassword(password);

  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
  const existingId = existing.rows[0]?.id ? String(existing.rows[0].id) : null;

  if (existingId) {
    await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [passwordHash, existingId] });
    if (displayName) {
      await db.execute({ sql: 'UPDATE users SET display_name = ? WHERE id = ?', args: [displayName, existingId] });
    }
    await db.execute({ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [existingId] });
    console.log(
      `Updated ${displayName ? 'profile and password' : 'password'} for ${email} (all existing sessions were revoked).`,
    );
  } else {
    const id = crypto.randomUUID();
    await db.execute({
      sql: 'INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)',
      args: [id, email, passwordHash, displayName],
    });
    console.log(`Created admin user ${email} (${id}).`);
  }
  console.log(`Connected to ${url}`);
}

main().catch((error) => {
  console.error('\nFailed to create admin user:');
  console.error(error);
  process.exit(1);
});
