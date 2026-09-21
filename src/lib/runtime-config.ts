import { env } from 'cloudflare:workers';
import { missingRuntimeConfig } from './config';

/** Worker-bound wrapper around the pure check in config.ts. */
export function runtimeConfigIssues(): string[] {
  return missingRuntimeConfig(env as unknown as Record<string, string | undefined>);
}
