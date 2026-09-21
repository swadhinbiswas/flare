/**
 * Runtime configuration checks. A missing secret used to surface as a blank
 * 500; now the app names what is missing so a deploy can be diagnosed from
 * /api/health or the login response.
 */

export const REQUIRED_RUNTIME_KEYS = ['TURSO_DATABASE_URL', 'SESSION_SECRET'] as const;

export function missingRuntimeConfig(values: Record<string, string | undefined>): string[] {
  return REQUIRED_RUNTIME_KEYS.filter((key) => {
    const value = values[key];
    return !value || value.trim().length === 0;
  });
}

export function configErrorMessage(missing: string[]): string {
  return `Server configuration incomplete. Set these secrets on the Worker and redeploy: ${missing.join(', ')}.`;
}
