import { getResend } from './resend';
import { queryOne, run } from './db';
import {
  createThread,
  findThreadByMessageId,
  findThreadBySubjectAndParticipants,
  getThreadRow,
  nowIso,
} from './threads';
import { parseAddressList, parseReferences, headerValue, serializeAddressList } from './mail-utils';
import { putObject } from './attachments';
import type { ResendWebhookEvent } from './events';

export interface IngestResult {
  inserted: boolean;
  messageId: string | null;
}

/**
 * Fetches one received email from the Resend Receiving API and stores it.
 *
 * The webhook payload is metadata-only, so the body and attachment bytes come
 * from separate API calls. De-duplication is by `resend_email_id`, which makes
 * both webhook retries and repeated syncs safe.
 */
export async function ingestReceivedEmail(emailId: string): Promise<IngestResult> {
  const existing = await queryOne<{ id: string }>('SELECT id FROM messages WHERE resend_email_id = ? LIMIT 1', [
    emailId,
  ]);
  if (existing) return { inserted: false, messageId: existing.id };

  const resend = getResend();
  const { data: full, error } = await resend.emails.receiving.get(emailId, { html_format: 'cid' });
  if (error || !full) {
    throw new Error(`Could not fetch received email ${emailId}: ${error?.message ?? 'unknown error'}`);
  }

  const headers = (full.headers ?? {}) as Record<string, unknown>;
  const rfcMessageId = headerValue(headers, 'message-id') ?? full.message_id ?? null;
  const inReplyTo = headerValue(headers, 'in-reply-to');
  const references = parseReferences(headerValue(headers, 'references'));

  const subject = full.subject ?? '';
  const from = full.from ?? '';
  const to = (full.to ?? []).filter(Boolean) as string[];
  const cc = (full.cc ?? []).filter(Boolean) as string[];
  const bcc = (full.bcc ?? []).filter(Boolean) as string[];
  const receivedAt = full.created_at ?? nowIso();

  // --- Thread resolution: headers first, then subject + participants -------
  let threadId: string | null = null;
  for (const candidate of [inReplyTo, ...references]) {
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
      full.text ?? null,
      full.html ?? null,
      rfcMessageId,
      inReplyTo,
      receivedAt,
    ],
  );

  // --- Attachments: metadata from `full`, bytes from the attachments API ---
  const inboundAttachments = full.attachments ?? [];
  if (inboundAttachments.length > 0) {
    const { data: list, error: listError } = await resend.emails.receiving.attachments.list({ emailId });
    if (listError) {
      console.warn(`[inbound] attachment list failed for ${emailId}: ${listError.message}`);
    }
    const downloadById = new Map<string, string>();
    for (const item of list?.data ?? []) downloadById.set(item.id, item.download_url);

    for (const attachment of inboundAttachments) {
      const downloadUrl = downloadById.get(attachment.id);
      const key = `inbound/${emailId}/${attachment.id}`;
      try {
        if (!downloadUrl) throw new Error('no download_url returned');
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error(`download failed with ${response.status}`);
        const buffer = await response.arrayBuffer();
        await putObject(key, buffer, attachment.content_type ?? 'application/octet-stream');
        await run(
          `INSERT INTO attachments (id, message_id, filename, content_type, size_bytes, r2_key, content_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            messageId,
            attachment.filename ?? 'attachment',
            attachment.content_type ?? 'application/octet-stream',
            attachment.size ?? buffer.byteLength,
            key,
            attachment.content_id ?? null,
            receivedAt,
          ],
        );
      } catch (attachmentError) {
        console.warn(`[inbound] failed to store attachment ${attachment.id} (${attachment.filename})`, attachmentError);
      }
    }
  }

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
 * 500 so Resend retries; the de-duplication check inside makes retries safe.
 */
export async function handleInbound(event: ResendWebhookEvent): Promise<void> {
  const emailId = event.data?.email_id;
  if (!emailId) return;
  await ingestReceivedEmail(emailId);
}
