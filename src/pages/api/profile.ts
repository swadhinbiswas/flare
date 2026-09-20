import type { APIRoute } from 'astro';
import { apiHandler, badRequest, json, readJsonBody, unauthorized } from '@/lib/api';
import { getProfile, normalizeAvatarUrl, updateAvatarUrl, updateDisplayName } from '@/lib/profile';

export const GET: APIRoute = apiHandler(async ({ locals }) => {
  if (!locals.user) return unauthorized();
  const profile = await getProfile(locals.user.id);
  return json({ profile });
});

export const PATCH: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const body = await readJsonBody<{ displayName?: string | null; avatarUrl?: string | null }>(request);
  if (!body) return badRequest('Invalid JSON body.');

  if ('displayName' in body) {
    await updateDisplayName(locals.user.id, body.displayName ?? null);
  }

  if ('avatarUrl' in body) {
    const raw = body.avatarUrl ?? null;
    if (raw && !normalizeAvatarUrl(raw)) {
      return badRequest('Avatar URL must be an http(s) link or a data:image URL.');
    }
    await updateAvatarUrl(locals.user.id, raw);
  }

  const profile = await getProfile(locals.user.id);
  return json({ profile });
});
