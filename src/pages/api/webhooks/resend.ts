import type { APIRoute } from 'astro';
import { getAccount, listAccounts } from '@/lib/accounts';
import { handleWebhookRequest } from '@/lib/webhook-handler';

/**
 * Default webhook endpoint. Kept for the primary account so existing Resend
 * webhook URLs continue to work; extra accounts use
 * /api/webhooks/<provider>/<accountId>.
 */
export const POST: APIRoute = async ({ request }) => {
  const account = (await getAccount('primary')) ?? (await listAccounts())[0];
  if (!account) return new Response('No mail account configured', { status: 500 });
  return handleWebhookRequest(request, account);
};
