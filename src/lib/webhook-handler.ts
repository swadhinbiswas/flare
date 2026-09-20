import { handleInbound, ingestReceivedEmail } from './inbound';
import { recordStatusEvent } from './events';
import { getMailProvider } from './providers';
import type { MailAccountConfig } from './accounts';

/**
 * Shared webhook pipeline. One route resolves the account (from the path or as
 * the primary account) and hands it here.
 *
 * Signature failures return 400 before touching the database. `email.received`
 * failures return 500 so the provider retries; the handler is idempotent per
 * provider message id. Status-event failures are logged and acked so a
 * transient database issue cannot cause a retry storm.
 */
export async function handleWebhookRequest(request: Request, account: MailAccountConfig): Promise<Response> {
  const payload = await request.text();
  const provider = getMailProvider(account);

  // Providers without a signature scheme hand the whole message over in the
  // webhook payload; they authenticate by being parsed and validated.
  if (provider.classifyWebhook?.(payload) === 'inbound' && provider.parseInbound) {
    try {
      const email = await provider.parseInbound(payload);
      await ingestReceivedEmail(email.id, { email, account });
      return new Response('ok');
    } catch (error) {
      console.error('[webhook] inbound handling failed', error);
      return new Response('Inbound handling failed', { status: 400 });
    }
  }

  let event;
  try {
    event = await provider.verifyWebhook(payload, request.headers, '');
  } catch (error) {
    console.warn('[webhook] signature verification failed', error);
    return new Response('Invalid webhook signature', { status: 400 });
  }

  if (event.type === 'email.received') {
    try {
      await handleInbound(event, account);
      return new Response('ok');
    } catch (error) {
      console.error('[webhook] inbound handling failed', error);
      return new Response('Inbound handling failed', { status: 500 });
    }
  }

  try {
    await recordStatusEvent(event);
  } catch (error) {
    console.error(`[webhook] failed to record ${event.type}`, error);
  }
  return new Response('ok');
}
