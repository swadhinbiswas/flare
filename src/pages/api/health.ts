import type { APIRoute } from 'astro';
import { json } from '@/lib/api';
import { runtimeConfigIssues } from '@/lib/config';

/**
 * Public on purpose: when the Worker is deployed without its secrets, login
 * fails, and this is the endpoint that says which ones are missing. It reports
 * names only, never values.
 */
export const GET: APIRoute = async () => {
  const missing = runtimeConfigIssues();
  return json(
    {
      ok: missing.length === 0,
      missing,
    },
    { status: missing.length === 0 ? 200 : 503 },
  );
};
