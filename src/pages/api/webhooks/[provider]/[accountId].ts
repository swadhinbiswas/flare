import type { APIRoute } from 'astro';
import { getAccount, listAccounts } from '@/lib/accounts';
import { handleWebhookRequest } from '@/lib/webhook-handler';

/**
 * Per-account webhook endpoint: /api/webhooks/<provider>/<accountId>.
 * The route resolves the account so each one can use its own signing secret.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const account = getAccount(params.accountId);
  if (!account) return new Response('Unknown account', { status: 404 });
  if (params.provider && params.provider.toLowerCase() !== account.provider) {
    return new Response('Provider mismatch', { status: 404 });
  }
  return handleWebhookRequest(request, account);
};

export const GET: APIRoute = async ({ params }) => {
  const account = getAccount(params.accountId) ?? listAccounts()[0];
  return new Response(`Webhook endpoint for ${account?.label ?? 'unknown'}. POST only.`, { status: 405 });
};
