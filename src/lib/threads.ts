import { getDb, asNumber, queryAll, queryOne, run } from './db';
import type {
  EmailEventDto,
  EmailEventRow,
  Folder,
  MessageDto,
  MessageRow,
  ThreadDetailDto,
  ThreadListResponse,
  ThreadRow,
  ThreadSummaryDto,
} from './types';
import { attachmentsForMessages, deleteObjects, toAttachmentDto } from './attachments';
import {
  emailOf,
  normalizeComposeHtml,
  parseAddressList,
  previewFrom,
  serializeAddressList,
  subjectsMatch,
} from './mail-utils';

const DEFAULT_PAGE_SIZE = 40;

export function nowIso(): string {
  return new Date().toISOString();
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

export async function listThreads(options: {
  accountId: string;
  folder: Folder | 'all';
  q?: string | null;
  cursor?: string | null;
  limit?: number;
}): Promise<ThreadListResponse> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), 100);
  const args: (string | number)[] = [];
  const clauses: string[] = ['account_id = ?'];
  args.push(options.accountId);

  if (options.folder !== 'all') {
    clauses.push('folder = ?');
    args.push(options.folder);
  }

  const q = options.q?.trim();
  if (q) {
    const like = `%${q}%`;
    clauses.push(
      `(subject LIKE ? OR participants LIKE ? OR EXISTS (
         SELECT 1 FROM messages m
          WHERE m.thread_id = threads.id
            AND (m.text_body LIKE ? OR m.html_body LIKE ? OR m.from_address LIKE ?)
       ))`,
    );
    args.push(like, like, like, like, like);
  }

  if (options.cursor) {
    clauses.push('last_message_at < ?');
    args.push(options.cursor);
  }

  args.push(limit + 1);
  const rows = await queryAll<ThreadRow>(
    `SELECT * FROM threads ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY last_message_at DESC LIMIT ?`,
    args,
  );

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const threads = await summarizeThreads(page);

  return {
    threads,
    nextCursor: hasMore && page.length > 0 ? (page[page.length - 1] as ThreadRow).last_message_at : null,
  };
}

export async function summarizeThreads(rows: ThreadRow[]): Promise<ThreadSummaryDto[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const messages = await queryAll<MessageRow>(
    `SELECT * FROM messages WHERE thread_id IN (${placeholders(ids.length)}) ORDER BY created_at ASC, rowid ASC`,
    ids,
  );

  const byThread = new Map<string, MessageRow[]>();
  for (const message of messages) {
    const list = byThread.get(message.thread_id) ?? [];
    list.push(message);
    byThread.set(message.thread_id, list);
  }

  return rows.map((row) => {
    const list = byThread.get(row.id) ?? [];
    const last = list[list.length - 1];
    let lastOutbound: MessageRow | undefined;
    for (let i = list.length - 1; i >= 0; i--) {
      if ((list[i] as MessageRow).direction === 'outbound') {
        lastOutbound = list[i];
        break;
      }
    }

    return {
      id: row.id,
      subject: row.subject,
      participants: parseAddressList(row.participants),
      lastMessageAt: row.last_message_at,
      folder: row.folder,
      unreadCount: asNumber(row.unread_count),
      messageCount: list.length,
      lastFrom: last?.from_address ?? '',
      lastDirection: last?.direction ?? 'inbound',
      preview: previewFrom(last?.text_body ?? null, last?.html_body ?? null),
      lastStatus: lastOutbound?.status ?? null,
      hasInbound: list.some((message) => message.direction === 'inbound'),
    } satisfies ThreadSummaryDto;
  });
}

export interface FolderCounts {
  counts: Record<Folder, number>;
  inboxUnread: number;
}

export async function getFolderCounts(accountId: string): Promise<FolderCounts> {
  const rows = await queryAll<{ folder: string; n: number }>(
    'SELECT folder, COUNT(*) AS n FROM threads WHERE account_id = ? GROUP BY folder',
    [accountId],
  );
  const counts: Record<Folder, number> = { inbox: 0, sent: 0, archive: 0, trash: 0 };
  for (const row of rows) {
    if (row.folder in counts) counts[row.folder as Folder] = asNumber(row.n);
  }
  const unread = await queryOne<{ n: number }>(
    `SELECT COALESCE(SUM(unread_count), 0) AS n FROM threads WHERE account_id = ? AND folder = 'inbox'`,
    [accountId],
  );
  return { counts, inboxUnread: asNumber(unread?.n ?? 0) };
}

/** Rewrite cid: references in inbound HTML to authenticated attachment URLs. */
function rewriteCidReferences(html: string | null, attachments: ReturnType<typeof toAttachmentDto>[]): string | null {
  if (!html) return html;
  const byContentId = new Map<string, string>();
  for (const attachment of attachments) {
    if (!attachment.contentId) continue;
    byContentId.set(attachment.contentId.replace(/^<|>$/g, '').toLowerCase(), attachment.id);
  }
  if (byContentId.size === 0) return html;

  return html.replace(/cid:([^"'\s>)]+)/gi, (match, rawCid: string) => {
    let key = rawCid;
    try {
      key = decodeURIComponent(rawCid);
    } catch {
      // keep raw
    }
    const id = byContentId.get(key.replace(/^<|>$/g, '').toLowerCase());
    return id ? `/api/attachments/${id}?inline=1` : match;
  });
}

export async function getThreadDetail(
  threadId: string,
  options: { markRead?: boolean; accountId?: string } = {},
): Promise<ThreadDetailDto | null> {
  const thread = options.accountId
    ? await queryOne<ThreadRow>('SELECT * FROM threads WHERE id = ? AND account_id = ?', [threadId, options.accountId])
    : await queryOne<ThreadRow>('SELECT * FROM threads WHERE id = ?', [threadId]);
  if (!thread) return null;

  const messages = await queryAll<MessageRow>(
    'SELECT * FROM messages WHERE thread_id = ? ORDER BY created_at ASC, rowid ASC',
    [threadId],
  );
  const messageIds = messages.map((message) => message.id);
  const [attachmentMap, eventRows] = await Promise.all([
    attachmentsForMessages(messageIds),
    messageIds.length
      ? queryAll<EmailEventRow>(
          `SELECT * FROM email_events WHERE message_id IN (${placeholders(messageIds.length)}) ORDER BY created_at ASC, rowid ASC`,
          messageIds,
        )
      : Promise.resolve([] as EmailEventRow[]),
  ]);

  const eventsByMessage = new Map<string, EmailEventDto[]>();
  for (const row of eventRows) {
    if (!row.message_id) continue;
    const list = eventsByMessage.get(row.message_id) ?? [];
    list.push({ type: row.resend_event_type, createdAt: row.created_at });
    eventsByMessage.set(row.message_id, list);
  }

  const dtos: MessageDto[] = messages.map((message) => {
    const attachments = (attachmentMap.get(message.id) ?? []).map(toAttachmentDto);
    return {
      id: message.id,
      threadId: message.thread_id,
      direction: message.direction,
      from: message.from_address,
      to: parseAddressList(message.to_addresses),
      cc: parseAddressList(message.cc_addresses),
      bcc: parseAddressList(message.bcc_addresses),
      subject: message.subject,
      text: message.text_body,
      html: rewriteCidReferences(normalizeComposeHtml(message.html_body), attachments),
      messageIdHeader: message.message_id_header,
      inReplyTo: message.in_reply_to,
      status: message.status,
      isRead: options.markRead ? true : asNumber(message.is_read) === 1,
      createdAt: message.created_at,
      attachments,
      events: eventsByMessage.get(message.id) ?? [],
    } satisfies MessageDto;
  });

  if (options.markRead) {
    await markThreadRead(threadId);
    thread.unread_count = 0;
  }

  const [summary] = await summarizeThreads([thread]);
  return { thread: summary as ThreadSummaryDto, messages: dtos };
}

export async function markThreadRead(threadId: string): Promise<void> {
  await getDb().batch(
    [
      {
        sql: `UPDATE messages SET is_read = 1 WHERE thread_id = ? AND direction = 'inbound'`,
        args: [threadId],
      },
      { sql: 'UPDATE threads SET unread_count = 0 WHERE id = ?', args: [threadId] },
    ],
    'write',
  );
}

export async function recomputeThreadUnread(threadId: string): Promise<number> {
  await run(
    `UPDATE threads SET unread_count = (
       SELECT COUNT(*) FROM messages
        WHERE thread_id = ? AND direction = 'inbound' AND is_read = 0
     ) WHERE id = ?`,
    [threadId, threadId],
  );
  const row = await queryOne<{ unread_count: number }>('SELECT unread_count FROM threads WHERE id = ?', [threadId]);
  return asNumber(row?.unread_count ?? 0);
}

export async function markMessageRead(
  messageId: string,
  isRead: boolean,
): Promise<{ threadId: string; unreadCount: number } | null> {
  const message = await queryOne<{ id: string; thread_id: string }>(
    'SELECT id, thread_id FROM messages WHERE id = ?',
    [messageId],
  );
  if (!message) return null;
  await run('UPDATE messages SET is_read = ? WHERE id = ?', [isRead ? 1 : 0, messageId]);
  const unreadCount = await recomputeThreadUnread(message.thread_id);
  return { threadId: message.thread_id, unreadCount };
}

export async function moveThread(threadId: string, folder: Folder): Promise<ThreadRow | null> {
  const thread = await queryOne<ThreadRow>('SELECT * FROM threads WHERE id = ?', [threadId]);
  if (!thread) return null;
  await run('UPDATE threads SET folder = ? WHERE id = ?', [folder, threadId]);
  return { ...thread, folder };
}

export async function deleteThread(threadId: string, r2Keys: string[]): Promise<void> {
  await deleteObjects(r2Keys);
  await getDb().batch(
    [
      {
        sql: 'DELETE FROM email_events WHERE message_id IN (SELECT id FROM messages WHERE thread_id = ?)',
        args: [threadId],
      },
      {
        sql: 'DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE thread_id = ?)',
        args: [threadId],
      },
      { sql: 'DELETE FROM messages WHERE thread_id = ?', args: [threadId] },
      { sql: 'DELETE FROM threads WHERE id = ?', args: [threadId] },
    ],
    'write',
  );
}

/** R2 keys for every attachment in a thread (used before a permanent delete). */
export async function threadAttachmentKeys(threadId: string): Promise<string[]> {
  const rows = await queryAll<{ r2_key: string }>(
    `SELECT a.r2_key AS r2_key FROM attachments a
       JOIN messages m ON m.id = a.message_id
      WHERE m.thread_id = ?`,
    [threadId],
  );
  return rows.map((row) => row.r2_key);
}

/** Find a thread by an RFC Message-ID (In-Reply-To / References / header). */
export async function findThreadByMessageId(messageIdValue: string, accountId: string): Promise<string | null> {
  const raw = messageIdValue.trim().replace(/^<|>$/g, '');
  if (!raw) return null;
  const row = await queryOne<{ thread_id: string }>(
    `SELECT thread_id FROM messages
      WHERE account_id = ? AND (message_id_header = ? OR message_id_header = ?)
      ORDER BY created_at DESC LIMIT 1`,
    [accountId, raw, `<${raw}>`],
  );
  return row?.thread_id ?? null;
}

/** Fallback threading: normalized subject + at least one shared participant. */
export async function findThreadBySubjectAndParticipants(
  subject: string,
  participants: string[],
  accountId: string,
): Promise<string | null> {
  if (!subject.trim()) return null;
  const participantEmails = participants.map(emailOf).filter(Boolean);
  if (participantEmails.length === 0) return null;

  const rows = await queryAll<{ id: string; subject: string; participants: string }>(
    `SELECT id, subject, participants FROM threads WHERE account_id = ? AND folder != 'trash' ORDER BY last_message_at DESC LIMIT 200`,
    [accountId],
  );
  for (const row of rows) {
    if (!subjectsMatch(row.subject, subject)) continue;
    const existing = parseAddressList(row.participants).map(emailOf);
    if (participantEmails.some((address) => existing.includes(address))) return row.id;
  }
  return null;
}

export async function createThread(input: {
  subject: string;
  participants: string[];
  folder: Folder;
  accountId: string;
  lastMessageAt?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const timestamp = input.lastMessageAt ?? nowIso();
  await run(
    `INSERT INTO threads (id, subject, participants, last_message_at, folder, unread_count, created_at, account_id)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      id,
      input.subject.slice(0, 500),
      serializeAddressList(input.participants),
      timestamp,
      input.folder,
      timestamp,
      input.accountId,
    ],
  );
  return id;
}

export async function addParticipants(threadId: string, participants: string[]): Promise<void> {
  if (participants.length === 0) return;
  const thread = await queryOne<{ participants: string }>('SELECT participants FROM threads WHERE id = ?', [threadId]);
  if (!thread) return;
  const merged = serializeAddressList([...parseAddressList(thread.participants), ...participants]);
  await run('UPDATE threads SET participants = ? WHERE id = ?', [merged, threadId]);
}

export async function touchThread(
  threadId: string,
  options: { lastMessageAt?: string; folder?: Folder } = {},
): Promise<void> {
  await run('UPDATE threads SET last_message_at = ? WHERE id = ?', [options.lastMessageAt ?? nowIso(), threadId]);
}

export async function getThreadRow(threadId: string): Promise<ThreadRow | null> {
  return queryOne<ThreadRow>('SELECT * FROM threads WHERE id = ?', [threadId]);
}

export async function threadBelongsToAccount(threadId: string, accountId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>('SELECT id FROM threads WHERE id = ? AND account_id = ?', [
    threadId,
    accountId,
  ]);
  return Boolean(row);
}
