import type { APIRoute } from 'astro';
import { apiHandler, errorResponse, json, readJsonBody } from '@/lib/api';
import { authenticate, createSession, serializeSessionCookie } from '@/lib/auth';
import { configErrorMessage, runtimeConfigIssues } from '@/lib/config';
import { hit, reset } from '@/lib/rate-limit';

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

export const POST: APIRoute = apiHandler(async ({ request }) => {
  const missing = runtimeConfigIssues();
  if (missing.length > 0) {
    console.error(`[auth] refusing to serve: missing ${missing.join(', ')}`);
    return errorResponse(500, configErrorMessage(missing), { missing });
  }

  const body = await readJsonBody<{ email?: string; password?: string }>(request);
  const email = body?.email?.trim() ?? '';
  const password = body?.password ?? '';
  if (!email || !password) {
    return errorResponse(400, 'Email and password are required.');
  }

  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  const key = `login:${ip}`;
  const limit = hit(key, LOGIN_LIMIT, LOGIN_WINDOW_SECONDS);
  if (!limit.allowed) {
    return errorResponse(429, `Too many login attempts. Try again in ${limit.retryAfterSeconds}s.`, {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }

  const user = await authenticate(email, password);
  if (!user) {
    return errorResponse(401, 'Invalid email or password.');
  }

  reset(key);
  const { token, maxAge } = await createSession(user.id);
  const response = json({ user });
  response.headers.append('set-cookie', serializeSessionCookie(token, maxAge));
  return response;
});
