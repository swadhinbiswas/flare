import type { APIRoute } from 'astro';
import { apiHandler, badRequest, errorResponse, json, notFound, unauthorized } from '@/lib/api';
import { AVATAR_MAX_BYTES, AVATAR_TYPES, clearAvatar, getProfile, readAvatar, setAvatar } from '@/lib/profile';

export const GET: APIRoute = apiHandler(async ({ locals }) => {
  if (!locals.user) return unauthorized();
  const profile = await getProfile(locals.user.id);
  if (!profile) return notFound('Profile not found');
  const response = await readAvatar(profile);
  return response ?? notFound('No avatar set');
});

export const POST: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const form = await request.formData();
  const file = form.get('file') ?? form.get('avatar');
  if (!(file instanceof File)) return badRequest('No image provided.');
  if (file.size > AVATAR_MAX_BYTES) {
    return errorResponse(413, `Avatar must be smaller than ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)}MB.`);
  }
  if (file.type && !AVATAR_TYPES.includes(file.type)) {
    return badRequest('Use a PNG, JPEG, WebP, GIF or SVG image.');
  }
  const buffer = await file.arrayBuffer();
  await setAvatar(locals.user.id, buffer, file.type || 'image/png');
  return json({ ok: true });
});

export const DELETE: APIRoute = apiHandler(async ({ locals }) => {
  if (!locals.user) return unauthorized();
  await clearAvatar(locals.user.id);
  return json({ ok: true });
});
