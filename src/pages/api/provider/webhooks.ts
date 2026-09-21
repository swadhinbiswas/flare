import type { APIRoute } from 'astro';
import { apiHandler, badRequest, json, readJsonBody, unauthorized } from '@/lib/api';
import { getActiveAccount } from '@/lib/accounts';
import { getMailProvider } from '@/lib/providers';

const DEFAULT_EVENTS = [
  'email.received',
  'email.sent',
  'email.scheduled',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.opened',
  'email.clicked',
];

export const GET: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const provider = getMailProvider(await getActiveAccount(request.headers.get('cookie')));
  const webhooks = await provider.listWebhooks();
  return json({ webhooks, provider: provider.id });
});

export const POST: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const account = await getActiveAccount(request.headers.get('cookie'));
  const provider = getMailProvider(account);
  const body = await readJsonBody<{ endpoint?: string; events?: string[] }>(request);
  const endpoint = body?.endpoint?.trim();
  if (!endpoint || !/^https?:\/\//.test(endpoint)) return badRequest('Provide the webhook URL to register.');
  const result = await provider.createWebhook({ endpoint, events: body?.events ?? DEFAULT_EVENTS });
  return json(result);
});

export const DELETE: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const provider = getMailProvider(await getActiveAccount(request.headers.get('cookie')));
  const body = await readJsonBody<{ id?: string }>(request);
  const id = body?.id?.trim();
  if (!id) return badRequest('Provide the webhook id.');
  await provider.deleteWebhook(id);
  return json({ ok: true });
});
