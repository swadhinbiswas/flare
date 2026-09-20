import { queryOne, run } from './db';
import { getMailProvider } from './providers';
import {
  createThread,
  findThreadByMessageId,
  findThreadBySubjectAndParticipants,
  getThreadRow,
  nowIso,
} from './threads';
import { parseAddressList, serializeAddressList } from './mail-utils';
import { putObject } from './attachments';
import type { ProviderReceivedEmail, ProviderWebhookEvent } from './providers/types';

export interface IngestResult {
  inserted: boolean;
  messageId: string | null;
}

/**
 * Fetches one received email from the mail provider and stores it.
 *
 * The webhook payload is metadata-only, so the body and attachment bytes come
 * from separate provider calls. De-duplication is by `resend_email_id`, which
 * makes both webhook retries and repeated syncs safe.
 */
export interface IngestOptions {
  /** Pre-parsed email, for providers that deliver content inside the webhook. */
  email?: ProviderReceivedEmail;
}

export async function ingestReceivedEmail(emailId: string, options: IngestOptions = {}): Promise<IngestResult> {
  const existing = await queryOne<{ id: string }>('SELECT id FROM messages WHERE resend_email_id = ? LIMIT 1', [
    emailId,
  ]);
  if (existing) return { inserted: false, messageId: existing.id };

  const provider = getMailProvider();
  const full = options.email ?? (await provider.getReceived(emailId));

  const subject = full.subject;
  const from = full.from;
  const { to, cc, bcc } = full;
  const receivedAt = full.createdAt || nowIso();

  // --- Thread resolution: headers first, then subject + participants -------
  let threadId: string | null = null;
  for (const candidate of [full.inReplyTo, ...full.references]) {
    if (!candidate) continue;
    threadId = await findThreadByMessageId(candidate);
    if (threadId) break;
  }
  if (!threadId) {
    threadId = await findThreadBySubjectAndParticipants(subject, [from, ...to]);
  }
  if (!threadId) {
    threadId = await createThread({
      subject,
      participants: [from, ...to, ...cc],
      folder: 'inbox',
      lastMessageAt: receivedAt,
    });
  }

  const thread = await getThreadRow(threadId);
  const messageId = crypto.randomUUID();

  await run(
    `INSERT INTO messages (
       id, thread_id, resend_email_id, direction, from_address, to_addresses, cc_addresses,
       bcc_addresses, subject, text_body, html_body, message_id_header, in_reply_to, status,
       is_read, created_at
     ) VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', 0, ?)`,
    [
      messageId,
      threadId,
      emailId,
      from,
      JSON.stringify(to),
      JSON.stringify(cc),
      JSON.stringify(bcc),
      subject,
      full.text,
      full.html,
      full.messageId,
      full.inReplyTo,
      receivedAt,
    ],
  );

  // --- Attachments: bytes come from the provider, stored via the blob store --
  for (const attachment of full.attachments) {
    const key = `inbound/${emailId}/${attachment.id}`;
    try {
      const buffer = attachment.downloadUrl
        ? await (async () => {
            const response = await fetch(attachment.downloadUrl as string);
            if (!response.ok) throw new Error(`attachment download failed with ${response.status}`);
            return response.arrayBuffer();
          })()
        : await provider.getAttachmentContent({ emailId, attachmentId: attachment.id });
      await putObject(key, buffer, attachment.contentType);
      await run(
        `INSERT INTO attachments (id, message_id, filename, content_type, size_bytes, r2_key, content_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          messageId,
          attachment.filename,
          attachment.contentType,
          attachment.size ?? buffer.byteLength,
          key,
          attachment.contentId,
          receivedAt,
        ],
      );
    } catch (attachmentError) {
      console.warn(`[inbound] failed to store attachment ${attachment.id} (${attachment.filename})`, attachmentError);
    }
  }

  await provider.finalizeInbound?.(full);

  // --- Thread bookkeeping ---------------------------------------------------
  const participants = [...parseAddressList(thread?.participants ?? '[]'), from, ...to, ...cc];
  const lastMessageAt =
    thread && Date.parse(thread.last_message_at) > Date.parse(receivedAt) ? thread.last_message_at : receivedAt;
  await run(
    `UPDATE threads SET subject = ?, participants = ?, last_message_at = ?, unread_count = unread_count + 1, folder = CASE WHEN folder = 'trash' THEN 'inbox' ELSE folder END WHERE id = ?`,
    [
      thread && thread.subject ? thread.subject : subject,
      serializeAddressList(participants),
      lastMessageAt,
      threadId,
    ],
  );

  return { inserted: true, messageId };
}

/**
 * Handles the `email.received` webhook. Throwing here makes the webhook return
 * 500 so the provider retries; the de-duplication check inside makes retries safe.
 */
export async function handleInbound(event: ProviderWebhookEvent): Promise<void> {
  const emailId = typeof event.data.email_id === 'string' ? event.data.email_id : null;
  if (!emailId) return;
  await ingestReceivedEmail(emailId);
}
