import type { APIRoute } from 'astro';
import { apiHandler, badRequest, json, readJsonBody, unauthorized } from '@/lib/api';
import { getActiveAccount } from '@/lib/accounts';
import { getMailProvider } from '@/lib/providers';

export const GET: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const provider = getMailProvider(getActiveAccount(request.headers.get('cookie')));
  const suppressions = await provider.listSuppressions();
  return json({ suppressions });
});

export const POST: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const provider = getMailProvider(getActiveAccount(request.headers.get('cookie')));
  if (!provider.addSuppression) return badRequest(`${provider.label} cannot add suppressions through its API.`);
  const body = await readJsonBody<{ email?: string; reason?: string }>(request);
  const email = body?.email?.trim();
  if (!email || !email.includes('@')) return badRequest('A valid email address is required.');
  await provider.addSuppression(email, body?.reason?.trim() || undefined);
  return json({ ok: true });
});

export const DELETE: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const provider = getMailProvider(getActiveAccount(request.headers.get('cookie')));
  const body = await readJsonBody<{ id?: string; email?: string }>(request);
  const target = body?.id?.trim() || body?.email?.trim();
  if (!target) return badRequest('Provide the suppression id or email.');
  await provider.removeSuppression(target);
  return json({ ok: true });
});
