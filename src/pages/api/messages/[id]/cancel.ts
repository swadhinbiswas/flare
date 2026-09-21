import type { APIRoute } from 'astro';
import { apiHandler, badRequest, errorResponse, json, notFound, unauthorized } from '@/lib/api';
import { getActiveAccount } from '@/lib/accounts';
import { getMailProvider } from '@/lib/providers';
import { queryOne, run } from '@/lib/db';
import { nowIso } from '@/lib/threads';

/** Cancels an email that is still scheduled with the provider. */
export const POST: APIRoute = apiHandler(async ({ params, request, locals }) => {
  if (!locals.user) return unauthorized();
  const id = params.id;
  if (!id) return badRequest('Missing message id.');

  const account = await getActiveAccount(request.headers.get('cookie'));
  const message = await queryOne<{ id: string; status: string; resend_email_id: string | null; thread_id: string }>(
    'SELECT id, status, resend_email_id, thread_id FROM messages WHERE id = ? AND account_id = ?',
    [id, account.id],
  );
  if (!message) return notFound('Message not found');
  if (message.status !== 'scheduled') return badRequest('Only scheduled messages can be canceled.');
  if (!message.resend_email_id) return badRequest('This message has no provider id to cancel.');

  const provider = getMailProvider(account);
  if (!provider.cancelScheduled) {
    return errorResponse(501, `${provider.label} cannot cancel scheduled email through its API.`);
  }

  try {
    await provider.cancelScheduled(message.resend_email_id);
  } catch (error) {
    return errorResponse(502, error instanceof Error ? error.message : 'Provider rejected the cancellation');
  }

  await run("UPDATE messages SET status = 'canceled' WHERE id = ?", [id]);
  await run(
    'INSERT INTO email_events (id, message_id, resend_event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
    [crypto.randomUUID(), id, 'email.canceled', JSON.stringify({ source: 'app' }), nowIso()],
  );

  return json({ ok: true, threadId: message.thread_id });
});
