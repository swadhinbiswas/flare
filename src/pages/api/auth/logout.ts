import type { APIRoute } from 'astro';
import { apiHandler, json } from '@/lib/api';
import { clearSessionCookie, destroySession, readSessionCookie } from '@/lib/auth';

export const POST: APIRoute = apiHandler(async ({ request }) => {
  await destroySession(readSessionCookie(request.headers.get('cookie')));
  const response = json({ ok: true });
  response.headers.append('set-cookie', clearSessionCookie());
  return response;
});
