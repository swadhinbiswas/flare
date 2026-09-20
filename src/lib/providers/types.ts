/**
 * Mail backend contract. Resend implements it today; SMTP/IMAP or another API
 * can be added as another implementation without touching the app code.
 */

export interface ProviderReceivedAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number | null;
  contentId: string | null;
  /** Signed URL when the provider hands over the bytes directly. */
  downloadUrl?: string | null;
}

export interface ProviderReceivedEmail {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  createdAt: string;
  attachments: ProviderReceivedAttachment[];
  /** Provider URL that purges their stored copy, when offered. */
  deletionUrl?: string | null;
}

export interface ProviderReceivedSummary {
  id: string;
  from: string;
  to: string[];
  subject: string;
  createdAt: string;
}

export interface ProviderOutboundAttachment {
  filename: string;
  content: string;
  contentType?: string;
}

export interface ProviderOutboundMessage {
  /** Already formatted as `Name <address>`. */
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string | null;
  text?: string | null;
  /** Extra headers such as In-Reply-To and References. */
  headers?: Record<string, string>;
  attachments?: ProviderOutboundAttachment[];
  /** ISO timestamp to schedule delivery instead of sending now. */
  scheduledAt?: string | null;
}

export interface ProviderScheduledEmail {
  id: string;
  subject: string;
  to: string[];
  scheduledAt: string;
}

export interface ProviderDomain {
  id: string;
  name: string;
  status: string;
  region: string;
  sending: string;
  receiving: string;
}

export interface ProviderWebhook {
  id: string;
  endpoint: string;
  events: string[] | null;
  status?: string;
}

export interface ProviderSuppression {
  id: string;
  email: string;
  reason: string | null;
  createdAt: string;
}

export interface ProviderMetrics {
  startDate: string;
  endDate: string;
  totals: Record<string, number>;
}

export interface ProviderWebhookEvent {
  type: string;
  createdAt?: string;
  data: Record<string, unknown>;
}

export interface MailProvider {
  readonly id: string;
  readonly label: string;

  isConfigured(): boolean;

  // Sending and status
  send(message: ProviderOutboundMessage): Promise<{ id: string }>;
  getMessageStatus(providerMessageId: string): Promise<string | null>;
  /** Cancel an email that is still scheduled. */
  cancelScheduled?(providerMessageId: string): Promise<void>;
  listScheduled?(): Promise<ProviderScheduledEmail[]>;

  // Receiving
  listReceived(limit: number): Promise<ProviderReceivedSummary[]>;
  getReceived(providerEmailId: string): Promise<ProviderReceivedEmail>;
  getAttachmentContent(input: { emailId: string; attachmentId: string }): Promise<ArrayBuffer>;

  // Webhooks
  verifyWebhook(payload: string, headers: Headers, secret: string): Promise<ProviderWebhookEvent>;
  /** Some providers deliver inbound mail as the webhook itself. */
  classifyWebhook?(payload: string): 'inbound' | 'status' | 'unknown';
  parseInbound?(payload: string): Promise<ProviderReceivedEmail>;
  finalizeInbound?(email: ProviderReceivedEmail): Promise<void>;

  // Account and deliverability
  listDomains(): Promise<ProviderDomain[]>;
  listWebhooks(): Promise<ProviderWebhook[]>;
  createWebhook(input: { endpoint: string; events: string[] }): Promise<ProviderWebhook & { signingSecret: string }>;
  deleteWebhook(id: string): Promise<void>;
  listSuppressions(): Promise<ProviderSuppression[]>;
  addSuppression?(email: string, reason?: string): Promise<void>;
  removeSuppression(idOrEmail: string): Promise<void>;
  getMetrics(days: number): Promise<ProviderMetrics>;
}
