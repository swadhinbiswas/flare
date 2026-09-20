import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { handleInbound } from '@/lib/inbound';
import { recordStatusEvent, type ResendWebhookEvent } from '@/lib/events';
import { verifyResendWebhook } from '@/lib/webhook-verify';

/**
 * All Resend webhook events land here. The endpoint is intentionally not behind
 * the session middleware: it is authenticated by verifying the Svix signature
 * over the RAW request body. Anything that fails verification is rejected with
 * 400 before touching the database.
 *
 * `email.received` failures return 500 so Resend retries (the inbound handler is
 * idempotent per resend_email_id). Status-event failures are logged and acked so
 * a transient DB issue cannot cause a retry storm.
 */
export const POST: APIRoute = async ({ request }) => {
  const payload = await request.text();

  let event: ResendWebhookEvent;
  try {
    event = verifyResendWebhook(payload, request.headers, env.RESEND_WEBHOOK_SECRET) as unknown as ResendWebhookEvent;
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
