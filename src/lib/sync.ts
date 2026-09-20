import { getResend } from './resend';
import { queryAll, run } from './db';
import { ingestReceivedEmail } from './inbound';
import { shouldAdvance } from './status';
import { nowIso } from './threads';
import type { MessageStatus } from './types';

/**
 * Resend only pushes *new* mail through webhooks, and the dashboard history is
 * never replayed. This pulls the recent picture on demand: received emails that
 * predate the webhook are ingested, and outbound messages get their current
 * delivery state from the API.
 */

const STATUS_FROM_LAST_EVENT: Record<string, MessageStatus> = {
  queued: 'queued',
  scheduled: 'queued',
  sent: 'sent',
  delivered: 'delivered',
  delivery_delayed: 'delivery_delayed',
  opened: 'opened',
  clicked: 'clicked',
  bounced: 'bounced',
  complained: 'complained',
  failed: 'failed',
  canceled: 'failed',
  suppressed: 'failed',
};

export interface SyncResult {
  /** Received emails Resend reported in the window. */
  scanned: number;
  /** Newly imported messages. */
  received: number;
  /** Outbound messages whose status advanced. */
  statuses: number;
  errors: string[];
}

export async function syncFromResend(limit = 25): Promise<SyncResult> {
  const resend = getResend();
  const result: SyncResult = { scanned: 0, received: 0, statuses: 0, errors: [] };

  const list = await resend.emails.receiving.list({ limit });
  if (list.error) {
    throw new Error(`Resend receiving list failed: ${list.error.message}`);
  }

  for (const item of list.data.data) {
    result.scanned += 1;
    try {
      const { inserted } = await ingestReceivedEmail(item.id);
      if (inserted) result.received += 1;
    } catch (error) {
      result.errors.push(`${item.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  const outbound = await queryAll<{ id: string; resend_email_id: string; status: MessageStatus }>(
    `SELECT id, resend_email_id, status FROM messages
      WHERE direction = 'outbound' AND resend_email_id IS NOT NULL
      ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );

  for (const message of outbound) {
    try {
      const { data, error } = await resend.emails.get(message.resend_email_id);
      if (error || !data) continue;
      const next = STATUS_FROM_LAST_EVENT[data.last_event];
      if (!next || !shouldAdvance(message.status, next)) continue;
      await run('UPDATE messages SET status = ? WHERE id = ?', [next, message.id]);
      await run(
        'INSERT INTO email_events (id, message_id, resend_event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
        [
          crypto.randomUUID(),
          message.id,
          `email.${data.last_event}`,
          JSON.stringify({ source: 'sync', last_event: data.last_event }),
          nowIso(),
        ],
      );
      result.statuses += 1;
    } catch (error) {
      result.errors.push(`${message.resend_email_id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  return result;
}
