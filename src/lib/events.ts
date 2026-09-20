import { queryOne, run } from './db';
import { statusFromEventType, shouldAdvance } from './status';
import { nowIso } from './threads';
import type { MessageStatus } from './types';

/**
 * Minimal structural type for a verified Resend webhook event. We only depend on
 * the fields the app actually reads, which keeps the webhook handler stable
 * across Resend SDK additions.
 */
export interface ResendWebhookEvent {
  type: string;
  created_at?: string;
  data: {
    email_id?: string;
    message_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    [key: string]: unknown;
  };
}

/**
 * Appends an entry to the audit log and advances `messages.status` only when the
 * new state ranks higher (monotonic — a late `email.sent` echo can never undo a
 * `delivered`, and bounced/complained/failed outrank the happy path).
 */
export async function recordStatusEvent(event: ResendWebhookEvent): Promise<void> {
  const emailId = event.data?.email_id;
  if (!emailId) return;

  const message = await queryOne<{ id: string; status: MessageStatus; message_id_header: string | null }>(
    'SELECT id, status, message_id_header FROM messages WHERE resend_email_id = ? LIMIT 1',
    [emailId],
  );
  if (!message) {
    // Unknown message (e.g. mail sent outside RFLARE) — nothing to record.
    return;
  }

  await run(
    'INSERT INTO email_events (id, message_id, resend_event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
    [crypto.randomUUID(), message.id, event.type, JSON.stringify(event), event.created_at ?? nowIso()],
  );

  // Capture the provider-assigned RFC Message-ID the first time we see it so
  // that replies from the recipient thread back into this conversation.
  const rfcMessageId = typeof event.data.message_id === 'string' ? event.data.message_id : null;
  if (rfcMessageId && !message.message_id_header) {
    await run(
      'UPDATE messages SET message_id_header = ? WHERE id = ? AND message_id_header IS NULL',
      [rfcMessageId, message.id],
    );
  }

  const next = statusFromEventType(event.type);
  if (next && shouldAdvance(message.status, next)) {
    await run('UPDATE messages SET status = ? WHERE id = ?', [next, message.id]);
  }
}
