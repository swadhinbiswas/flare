import { getResend } from './resend';
import type { CreateEmailOptions } from 'resend';
import { queryOne, run } from './db';
import { claimDraftAttachments, getObject, arrayBufferToBase64, releaseDraftAttachments } from './attachments';
import {
  addParticipants,
  createThread,
  findThreadByMessageId,
  findThreadBySubjectAndParticipants,
  getThreadRow,
  nowIso,
  touchThread,
} from './threads';
import { formatFrom, isValidEmail, renderComposeBody, stripMessageId } from './mail-utils';
import type { MessageStatus, SendMessageInput, SessionUser } from './types';

export class SendError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'SendError';
  }
}

export interface SendResult {
  messageId: string;
  threadId: string;
  resendEmailId: string | null;
  status: MessageStatus;
}

export function validateSendInput(input: SendMessageInput): string[] {
  const errors: string[] = [];
  const to = (input.to ?? []).map((value) => value.trim()).filter(Boolean);
  if (to.length === 0) errors.push('At least one recipient is required.');
  for (const address of [...to, ...(input.cc ?? []), ...(input.bcc ?? [])]) {
    if (!isValidEmail(address)) errors.push(`"${address}" is not a valid email address.`);
  }
  if (!input.subject?.trim() && !input.text?.trim() && !input.html?.trim()) {
    errors.push('A subject or message body is required.');
  }
  if ((input.subject ?? '').length > 998) errors.push('Subject is too long.');
  return errors;
}

async function recordSendEvent(messageId: string, type: string, payload: unknown): Promise<void> {
  await run(
    'INSERT INTO email_events (id, message_id, resend_event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
    [crypto.randomUUID(), messageId, type, JSON.stringify(payload), nowIso()],
  );
}

/**
 * Persists an outbound message (status `queued`) *before* calling Resend, so the
 * UI can show it instantly, then advances it to `sent` or `failed` once the API
 * responds. Webhooks drive the rest of the delivery timeline.
 */
export async function sendMessage(params: {
  user: SessionUser;
  input: SendMessageInput;
  displayName: string;
}): Promise<SendResult> {
  const { user, input, displayName } = params;
  const errors = validateSendInput(input);
  if (errors.length > 0) throw new SendError(errors[0] as string, errors.join(' '));

  const to = (input.to ?? []).map((value) => value.trim()).filter(Boolean);
  const cc = (input.cc ?? []).map((value) => value.trim()).filter(Boolean);
  const bcc = (input.bcc ?? []).map((value) => value.trim()).filter(Boolean);

  // --- Resolve (or create) the thread -------------------------------------
  let threadId: string | null = input.threadId ?? null;
  if (threadId && !(await getThreadRow(threadId))) {
    throw new SendError('Thread not found.');
  }
  if (!threadId && input.inReplyTo) {
    threadId = await findThreadByMessageId(input.inReplyTo);
  }
  if (!threadId) {
    threadId = await findThreadBySubjectAndParticipants(input.subject ?? '', [user.email, ...to, ...cc]);
  }
  if (!threadId) {
    threadId = await createThread({
      subject: input.subject ?? '',
      participants: [user.email, ...to, ...cc, ...bcc],
      folder: 'sent',
    });
  }

  const thread = await getThreadRow(threadId);
  const subject = input.subject?.trim() || (thread?.subject ? `Re: ${thread.subject}` : '(no subject)');

  const html = input.html?.trim() ? input.html : input.text?.trim() ? renderComposeBody(input.text) : null;
  const text = input.text?.trim() ? input.text : null;

  // --- Persist before sending ---------------------------------------------
  const messageId = crypto.randomUUID();
  const createdAt = nowIso();
  await run(
    `INSERT INTO messages (
       id, thread_id, resend_email_id, direction, from_address, to_addresses, cc_addresses,
       bcc_addresses, subject, text_body, html_body, message_id_header, in_reply_to, status,
       is_read, created_at
     ) VALUES (?, ?, NULL, 'outbound', ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'queued', 1, ?)`,
    [
      messageId,
      threadId,
      formatFrom(user.email, displayName),
      JSON.stringify(to),
      JSON.stringify(cc),
      JSON.stringify(bcc),
      subject,
      text,
      html,
      stripMessageId(input.inReplyTo),
      createdAt,
    ],
  );

  const attachments = await claimDraftAttachments(input.attachmentIds ?? [], messageId);
  let payloadAttachments: { filename: string; content: string }[] | undefined;
  try {
    payloadAttachments = attachments.length
      ? await Promise.all(
          attachments.map(async (attachment) => {
            const object = await getObject(attachment.r2_key);
            if (!object) throw new SendError(`Attachment "${attachment.filename}" could not be read.`);
            const buffer = await object.arrayBuffer();
            return { filename: attachment.filename, content: await arrayBufferToBase64(buffer) };
          }),
        )
      : undefined;
  } catch (error) {
    await run(`UPDATE messages SET status = 'failed' WHERE id = ?`, [messageId]);
    await recordSendEvent(messageId, 'email.failed', {
      message: error instanceof Error ? error.message : 'Attachment read failed',
    });
    throw error;
  }

  const replyHeaders = input.inReplyTo
    ? {
        'In-Reply-To': stripMessageId(input.inReplyTo) ?? input.inReplyTo,
        References: stripMessageId(input.inReplyTo) ?? input.inReplyTo,
      }
    : undefined;

  // --- Send ----------------------------------------------------------------
  const resend = getResend();
  const base = {
    from: formatFrom(user.email, displayName),
    to,
    subject,
    ...(cc.length ? { cc } : {}),
    ...(bcc.length ? { bcc } : {}),
    ...(payloadAttachments ? { attachments: payloadAttachments } : {}),
    ...(replyHeaders ? { headers: replyHeaders } : {}),
  };
  const payload: CreateEmailOptions = html
    ? { ...base, html, ...(text ? { text } : {}) }
    : { ...base, text: text ?? '' };
  const { data, error } = await resend.emails.send(payload);

  if (error || !data?.id) {
    const detail = error?.message ?? 'Resend returned no message id';
    await run(`UPDATE messages SET status = 'failed' WHERE id = ?`, [messageId]);
    await recordSendEvent(messageId, 'email.failed', { message: detail });
    await releaseDraftAttachments(attachments);
    throw new SendError(`Sending failed: ${detail}`);
  }

  await run(`UPDATE messages SET resend_email_id = ?, status = 'sent' WHERE id = ?`, [data.id, messageId]);
  await recordSendEvent(messageId, 'email.sent', { id: data.id, subject, to });
  await addParticipants(threadId, [user.email, ...to, ...cc, ...bcc]);
  await touchThread(threadId, { lastMessageAt: createdAt });

  return { messageId, threadId, resendEmailId: data.id, status: 'sent' };
}

export async function messageExistsForResendId(resendEmailId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>('SELECT id FROM messages WHERE resend_email_id = ? LIMIT 1', [
    resendEmailId,
  ]);
  return Boolean(row);
}
