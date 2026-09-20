export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  /** External image URL, when set instead of an upload. */
  avatarUrl: string | null;
  /** True when an avatar blob is stored for this user. */
  hasAvatar: boolean;
}

export type Folder = 'inbox' | 'sent' | 'archive' | 'trash';

export const FOLDERS: Folder[] = ['inbox', 'sent', 'archive', 'trash'];

export type Direction = 'inbound' | 'outbound';

/**
 * Current delivery state for a message. `messages.status` is the highest-ranked
 * state seen so far (see STATUS_RANK in src/lib/status.ts) so a late webhook
 * event can never move a message backwards.
 */
export type MessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'bounced'
  | 'complained'
  | 'opened'
  | 'clicked'
  | 'received'
  | 'failed';

export interface ThreadRow {
  id: string;
  subject: string;
  participants: string; // JSON array
  last_message_at: string;
  folder: Folder;
  unread_count: number;
  created_at: string;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  resend_email_id: string | null;
  direction: Direction;
  from_address: string;
  to_addresses: string; // JSON array
  cc_addresses: string; // JSON array
  bcc_addresses: string; // JSON array
  subject: string;
  text_body: string | null;
  html_body: string | null;
  message_id_header: string | null;
  in_reply_to: string | null;
  status: MessageStatus;
  is_read: number;
  created_at: string;
}

export interface AttachmentRow {
  id: string;
  message_id: string | null;
  filename: string;
  content_type: string;
  size_bytes: number | null;
  r2_key: string;
  content_id: string | null;
  created_at: string;
}

export interface EmailEventRow {
  id: string;
  message_id: string | null;
  resend_event_type: string;
  payload_json: string;
  created_at: string;
}

/** Attachment as sent to the client (never exposes the R2 key). */
export interface AttachmentDto {
  id: string;
  filename: string;
  contentType: string;
  size: number | null;
  contentId: string | null;
}

/** A message plus its attachments and status timeline, as returned by the API. */
export interface MessageDto {
  id: string;
  threadId: string;
  direction: Direction;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string | null;
  html: string | null;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  status: MessageStatus;
  isRead: boolean;
  createdAt: string;
  attachments: AttachmentDto[];
  events: EmailEventDto[];
}

export interface EmailEventDto {
  type: string;
  createdAt: string;
}

export interface ThreadSummaryDto {
  id: string;
  subject: string;
  participants: string[];
  lastMessageAt: string;
  folder: Folder;
  unreadCount: number;
  messageCount: number;
  /** Sender of the most recent message (display string). */
  lastFrom: string;
  /** Direction of the most recent message. */
  lastDirection: Direction;
  /** One-line plain-text preview of the most recent message. */
  preview: string;
  /** Status of the most recent outbound message, or null if none. */
  lastStatus: MessageStatus | null;
  hasInbound: boolean;
}

export interface ThreadDetailDto {
  thread: ThreadSummaryDto;
  messages: MessageDto[];
}

export interface ThreadListResponse {
  threads: ThreadSummaryDto[];
  nextCursor: string | null;
}

export interface SendMessageInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  /** Existing thread to add the message to (reply). */
  threadId?: string;
  /** RFC Message-ID being replied to; used for In-Reply-To/References and threading. */
  inReplyTo?: string;
  /** Ids returned by /api/attachments/upload. */
  attachmentIds?: string[];
}
