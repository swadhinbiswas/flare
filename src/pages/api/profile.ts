import type { APIRoute } from 'astro';
import { apiHandler, json, readJsonBody, unauthorized } from '@/lib/api';
import { getProfile, updateDisplayName } from '@/lib/profile';

export const GET: APIRoute = apiHandler(async ({ locals }) => {
  if (!locals.user) return unauthorized();
  const profile = await getProfile(locals.user.id);
  return json({ profile });
});

export const PATCH: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const body = await readJsonBody<{ displayName?: string | null }>(request);
  await updateDisplayName(locals.user.id, body?.displayName ?? null);
  const profile = await getProfile(locals.user.id);
  return json({ profile });
});
