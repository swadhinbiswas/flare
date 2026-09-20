import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleInbound } from '@/lib/inbound';
import { recordStatusEvent } from '@/lib/events';
import { getMailProvider } from '@/lib/providers';

/**
 * All mail provider webhook events land here. The endpoint is intentionally not
 * behind the session middleware: it is authenticated by verifying the provider
 * signature over the RAW request body. Anything that fails verification is
 * rejected with 400 before touching the database.
 *
 * `email.received` failures return 500 so the provider retries (the inbound
 * handler is idempotent per provider message id). Status-event failures are
 * logged and acked so a transient DB issue cannot cause a retry storm.
 */
export const POST: APIRoute = async ({ request }) => {
  const payload = await request.text();
  const provider = getMailProvider();

  let event;
  try {
    event = provider.verifyWebhook(payload, request.headers, env.RESEND_WEBHOOK_SECRET);
  } catch (error) {
    console.warn('[webhook] signature verification failed', error);
    return new Response('Invalid webhook signature', { status: 400 });
  }

  if (event.type === 'email.received') {
    try {
      await handleInbound(event);
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
};
