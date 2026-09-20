import type { APIRoute } from 'astro';
import { apiHandler, json, unauthorized } from '@/lib/api';

export const GET: APIRoute = apiHandler(async ({ locals }) => {
  if (!locals.user) return unauthorized();
  return json({ user: locals.user });
});
