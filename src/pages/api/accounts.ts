import type { APIRoute } from 'astro';
import { apiHandler, badRequest, errorResponse, json, readJsonBody, unauthorized } from '@/lib/api';
import {
  accountSummaries,
  createAccount,
  deleteAccount,
  getAccount,
  getActiveAccountId,
  serializeAccountCookie,
  type AccountInput,
} from '@/lib/accounts';

export const GET: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  return json({
    accounts: await accountSummaries(),
    activeId: await getActiveAccountId(request.headers.get('cookie')),
  });
});

/** Switch the active account. */
export const POST: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const body = await readJsonBody<{ id?: string }>(request);
  const id = body?.id?.trim();
  if (!id || !(await getAccount(id))) return errorResponse(404, 'Unknown account');
  const response = json({ ok: true, activeId: id });
  response.headers.append('set-cookie', serializeAccountCookie(id));
  return response;
});

/** Create an account. Secrets go into the encrypted vault, never into config. */
export const PUT: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const body = await readJsonBody<AccountInput>(request);
  if (!body) return badRequest('Invalid JSON body.');
  try {
    const account = await createAccount(body);
    const response = json({
      account: {
        id: account.id,
        provider: account.provider,
        label: account.label,
        fromEmail: account.fromEmail,
      },
    });
    response.headers.append('set-cookie', serializeAccountCookie(account.id));
    return response;
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : 'Could not create the account');
  }
});

export const DELETE: APIRoute = apiHandler(async ({ request, locals }) => {
  if (!locals.user) return unauthorized();
  const body = await readJsonBody<{ id?: string }>(request);
  const id = body?.id?.trim();
  if (!id) return badRequest('Provide the account id.');
  if (id === 'primary' && !(await getAccount(id))?.secrets) {
    return badRequest('The primary account comes from the environment and cannot be deleted.');
  }
  const removed = await deleteAccount(id);
  if (!removed) return badRequest('That account is defined in the environment, not the database.');
  return json({ ok: true });
});
