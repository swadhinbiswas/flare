import type { APIRoute } from 'astro';
import { apiHandler, json, errorResponse, readJsonBody, unauthorized } from '@/lib/api';
import { accountSummaries, getActiveAccountId, getAccount, serializeAccountCookie } from '@/lib/accounts';

export const GET: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  return json({
    accounts: accountSummaries(),
    activeId: getActiveAccountId(request.headers.get('cookie')),
  });
});

export const POST: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const body = await readJsonBody<{ id?: string }>(request);
  const id = body?.id?.trim();
  if (!id || !getAccount(id)) return errorResponse(404, 'Unknown account');
  const response = json({ ok: true, activeId: id });
  response.headers.append('set-cookie', serializeAccountCookie(id));
  return response;
});
