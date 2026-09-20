import { env } from 'cloudflare:workers';
import { queryAll, run } from './db';
import type { AttachmentDto, AttachmentRow, SessionUser } from './types';
import { emailOf } from './mail-utils';

/** Max size per uploaded attachment (Resend caps total message size ~40MB). */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export function sanitizeFilename(filename: string): string {
  const cleaned = filename.replace(/[\u0000-\u001f\u007f/\\]/g, '_').trim();
  return cleaned.slice(0, 200) || 'attachment';
}

export function toAttachmentDto(row: AttachmentRow): AttachmentDto {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size_bytes == null ? null : Number(row.size_bytes),
    contentId: row.content_id,
  };
}

export async function putObject(key: string, body: ArrayBuffer | ReadableStream, contentType: string): Promise<void> {
  await env.ATTACHMENTS.put(key, body, {
    httpMetadata: { contentType },
  });
}

export async function getObject(key: string) {
  return env.ATTACHMENTS.get(key);
}

export async function deleteObjects(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map(async (key) => {
      try {
        await env.ATTACHMENTS.delete(key);
      } catch (error) {
        console.warn(`[attachments] failed to delete R2 object ${key}`, error);
      }
    }),
  );
}

export async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Outbound attachments are uploaded before the message exists (message_id NULL)
 * and claimed by the send handler once the message row is inserted.
 */
export async function claimDraftAttachments(ids: string[], messageId: string): Promise<AttachmentRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await queryAll<AttachmentRow>(
    `SELECT * FROM attachments WHERE message_id IS NULL AND id IN (${placeholders})`,
    ids,
  );
  if (rows.length === 0) return [];

  const claimedIds = rows.map((row) => row.id);
  const claimedPlaceholders = claimedIds.map(() => '?').join(', ');
  await run(
    `UPDATE attachments SET message_id = ? WHERE id IN (${claimedPlaceholders})`,
    [messageId, ...claimedIds],
  );
  return rows.map((row) => ({ ...row, message_id: messageId }));
}

export async function releaseDraftAttachments(rows: AttachmentRow[]): Promise<void> {
  if (rows.length === 0) return;
  const placeholders = rows.map(() => '?').join(', ');
  await run(`UPDATE attachments SET message_id = NULL WHERE id IN (${placeholders})`, rows.map((r) => r.id));
}

export async function attachmentsForMessages(messageIds: string[]): Promise<Map<string, AttachmentRow[]>> {
  const map = new Map<string, AttachmentRow[]>();
  if (messageIds.length === 0) return map;
  const placeholders = messageIds.map(() => '?').join(', ');
  const rows = await queryAll<AttachmentRow>(
    `SELECT * FROM attachments WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`,
    messageIds,
  );
  for (const row of rows) {
    if (!row.message_id) continue;
    const list = map.get(row.message_id) ?? [];
    list.push(row);
    map.set(row.message_id, list);
  }
  return map;
}

/**
 * Access check for attachment downloads. RFLARE is a single-tenant mailbox: any
 * authenticated session may read any stored message. This function exists so the
 * policy is stated in exactly one place; if this ever grows per-user mailboxes,
 * check the session user against the thread participants here.
 */
export async function canUserAccessAttachment(user: SessionUser, row: AttachmentRow): Promise<boolean> {
  if (!user) return false;
  if (!row.message_id) {
    // Unclaimed draft upload from the compose flow: keep it inside the outbound
    // namespace so it can never leak an inbound blob that has not been claimed.
    return row.r2_key.startsWith('outbound/');
  }
  return true;
}

export function isInboundDomainAddress(address: string): boolean {
  const domain = env.RESEND_INBOUND_DOMAIN.toLowerCase();
  return emailOf(address).endsWith(`@${domain}`);
}
