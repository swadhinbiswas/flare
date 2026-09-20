import { getMailProvider } from './providers';
import { queryAll, run } from './db';
import { ingestReceivedEmail } from './inbound';
import { shouldAdvance } from './status';
import { nowIso } from './threads';
import type { MailAccountConfig } from './accounts';
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

export async function syncFromResend(limit: number, account: MailAccountConfig): Promise<SyncResult> {
  const provider = getMailProvider(account);
  const result: SyncResult = { scanned: 0, received: 0, statuses: 0, errors: [] };

  const list = await provider.listReceived(limit);

  for (const item of list) {
    result.scanned += 1;
    try {
      const { inserted } = await ingestReceivedEmail(item.id, { account });
      if (inserted) result.received += 1;
    } catch (error) {
      result.errors.push(`${item.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  const outbound = await queryAll<{ id: string; resend_email_id: string; status: MessageStatus }>(
    `SELECT id, resend_email_id, status FROM messages
      WHERE account_id = ? AND direction = 'outbound' AND resend_email_id IS NOT NULL
      ORDER BY created_at DESC LIMIT ?`,
    [account.id, limit],
  );

  for (const message of outbound) {
    try {
      const lastEvent = await provider.getMessageStatus(message.resend_email_id);
      const next = lastEvent ? STATUS_FROM_LAST_EVENT[lastEvent] : null;
      if (!lastEvent || !next || !shouldAdvance(message.status, next)) continue;
      await run('UPDATE messages SET status = ? WHERE id = ?', [next, message.id]);
      await run(
        'INSERT INTO email_events (id, message_id, resend_event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
        [
          crypto.randomUUID(),
          message.id,
          `email.${lastEvent}`,
          JSON.stringify({ source: 'sync', last_event: lastEvent }),
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
