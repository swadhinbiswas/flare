import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Shared helpers for the Node CLI scripts (migrate, create-admin). These run
 * outside the Worker, so they read credentials from `.dev.vars` (with real
 * process env taking precedence) and talk to Turso over the libSQL HTTP client.
 */

const here = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(here, '..');

export function loadEnv(): Record<string, string> {
  // .env is the canonical source; .dev.vars (Worker runtime file) overrides it,
  // and real process env overrides both.
  const fromEnv = parseEnvFile(resolve(projectRoot, '.env'));
  const fromDevVars = parseEnvFile(resolve(projectRoot, '.dev.vars'));
  return { ...fromEnv, ...fromDevVars, ...process.env } as Record<string, string>;
}

function parseEnvFile(file: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!existsSync(file)) return parsed;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function requireEnv(env: Record<string, string>, name: string): string {
  const value = env[name];
  if (!value) {
    console.error(`Missing ${name}. Set it in .dev.vars or the environment.`);
    process.exit(1);
  }
  return value;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/** Best-effort `wrangler types` run so bindings types stay in sync with config. */
export function refreshWorkerTypes(): void {
  try {
    execFileSync('pnpm', ['exec', 'wrangler', 'types'], { cwd: projectRoot, stdio: 'inherit' });
  } catch {
    console.warn('Could not run `wrangler types` (ignored).');
  }
}
