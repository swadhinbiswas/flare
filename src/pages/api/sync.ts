import type { APIRoute } from 'astro';
import { apiHandler, json, readJsonBody, unauthorized } from '@/lib/api';
import { syncFromResend } from '@/lib/sync';

/**
 * Imports recent mail from Resend and refreshes outbound statuses. Auth-gated:
 * the webhook is the push path, this is the pull path.
 */
export const POST: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const body = await readJsonBody<{ limit?: number }>(request);
  const limit = Math.min(Math.max(body?.limit ?? 25, 1), 100);
  const result = await syncFromResend(limit);
  return json(result);
});
