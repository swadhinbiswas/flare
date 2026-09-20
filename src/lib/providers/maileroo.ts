import { env } from 'cloudflare:workers';
import type { MailProvider, ProviderReceivedEmail } from './types';

export interface MailerooConfig {
  apiKey?: string;
  webhookSecret?: string;
  fromName?: string;
  fromEmail?: string;
  inboundDomain?: string;
}

interface EmailObject {
  address: string;
  display_name?: string;
}

const API_BASE = 'https://smtp.maileroo.com/api/v2';
const ACCOUNT_BASE = 'https://api.maileroo.com/v1';

/** Maileroo status events mapped onto the app's canonical status vocabulary. */
const STATUS_EVENT_MAP: Record<string, string> = {
  accepted: 'sent',
  delivered: 'delivered',
  deferred: 'delivery_delayed',
  failed: 'bounced',
  rejected: 'failed',
  opened: 'opened',
  clicked: 'clicked',
  complained: 'complained',
};

function toEmailObject(value: string): EmailObject {
  const match = value.match(/^\s*(?:"?([^"<]*)"?)\s*<([^>]+)>\s*$/);
  if (match) {
    const display = match[1]?.trim();
    return display ? { address: match[2] as string, display_name: display } : { address: match[2] as string };
  }
  return { address: value.trim() };
}

function firstHeader(headers: Record<string, string[]> | undefined, name: string): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const [key, values] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    return values?.[0] ?? null;
  }
  return null;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function createMailerooProvider(config: MailerooConfig = {}): MailProvider {
  const apiKey = config.apiKey ?? env.MAILEROO_API_KEY ?? '';
  const webhookSecret = config.webhookSecret ?? env.MAILEROO_WEBHOOK_SECRET ?? '';

  async function sendJson(url: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, ...(init.headers ?? {}) },
    });
    const body = (await response.json().catch(() => null)) as { success?: boolean; message?: string } | null;
    if (!response.ok || body?.success === false) {
      throw new Error(body?.message ?? `Maileroo request failed with ${response.status}`);
    }
    return body;
  }

  async function accountRequest(method: string, path: string, payload?: unknown): Promise<{ data?: unknown }> {
    const response = await fetch(`${ACCOUNT_BASE}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
        ...(payload ? { 'content-type': 'application/json' } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const body = (await response.json().catch(() => null)) as
      | { data?: unknown; error?: { message?: string } }
      | null;
    if (!response.ok) {
      throw new Error(body?.error?.message ?? `Maileroo account API failed with ${response.status}`);
    }
    return body ?? {};
  }

  const accountGet = (path: string) => accountRequest('GET', path);
  const accountSend = (method: string, path: string, payload?: unknown) => accountRequest(method, path, payload);

  const unsupported = (feature: string): never => {
    throw new Error(`Maileroo does not expose ${feature} through its API. Inbound mail arrives by webhook.`);
  };

  return {
    id: 'maileroo',
    label: 'Maileroo',

    isConfigured() {
      return Boolean(apiKey);
    },

    async send(message) {
      const response = await fetch(`${API_BASE}/emails`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({
          from: toEmailObject(message.from),
          to: message.to.map(toEmailObject),
          ...(message.cc?.length ? { cc: message.cc.map(toEmailObject) } : {}),
          ...(message.bcc?.length ? { bcc: message.bcc.map(toEmailObject) } : {}),
          subject: message.subject,
          ...(message.html ? { html: message.html } : {}),
          ...(message.text ? { plain: message.text } : {}),
          ...(message.attachments?.length
            ? {
                attachments: message.attachments.map((attachment) => ({
                  file_name: attachment.filename,
                  ...(attachment.contentType ? { content_type: attachment.contentType } : {}),
                  content: attachment.content,
                })),
              }
            : {}),
          ...(message.headers ? { headers: message.headers } : {}),
          ...(message.scheduledAt ? { scheduled_at: message.scheduledAt } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: string; data?: { reference_id?: string } }
        | null;
      if (!response.ok || !body?.success) {
        throw new Error(body?.message ?? `Maileroo send failed with ${response.status}`);
      }
      const referenceId = body.data?.reference_id;
      if (!referenceId) throw new Error('Maileroo returned no reference id');
      return { id: referenceId };
    },

    async getMessageStatus() {
      // Maileroo reports status through webhooks, not a per-message lookup.
      return null;
    },

    async cancelScheduled(providerMessageId) {
      await sendJson(`${API_BASE}/emails/scheduled/${encodeURIComponent(providerMessageId)}`, { method: 'DELETE' });
    },

    async listScheduled() {
      const body = (await sendJson(`${API_BASE}/emails/scheduled?per_page=100`)) as {
        data?: { results?: { reference_id?: string; subject?: string; recipients?: string[]; scheduled_at?: string }[] };
      };
      return (body.data?.results ?? []).map((item) => ({
        id: item.reference_id ?? '',
        subject: item.subject ?? '',
        to: item.recipients ?? [],
        scheduledAt: item.scheduled_at ?? '',
      }));
    },

    listReceived() {
      return unsupported('a list of received emails');
    },

    getReceived() {
      return unsupported('received email retrieval');
    },

    getAttachmentContent() {
      return unsupported('attachment retrieval by id');
    },

    classifyWebhook(payload) {
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        if (typeof parsed.validation_url === 'string' && typeof parsed._id === 'string') return 'inbound';
        if (typeof parsed.event_type === 'string') return 'status';
      } catch {
        // fall through
      }
      return 'unknown';
    },

    async parseInbound(payload) {
      const event = JSON.parse(payload) as {
        _id: string;
        validation_url?: string;
        message_id?: string;
        envelope_sender?: string;
        recipients?: string[];
        headers?: Record<string, string[]>;
        body?: { plaintext?: string; html?: string };
        attachments?: { filename: string; content_id?: string; content_type?: string; url: string; size: number }[];
        processed_at?: number;
      };

      // Maileroo authenticates inbound callbacks by having you hit a one-time
      // validation URL. Failure means the payload is not from them.
      if (event.validation_url) {
        const validation = await fetch(event.validation_url).catch(() => null);
        const result = (await validation?.json().catch(() => null)) as { success?: boolean } | null;
        if (!result?.success) throw new Error('Maileroo inbound validation failed');
      }

      const headers = event.headers ?? {};
      const to = (event.recipients ?? firstHeader(headers, 'to')?.split(',') ?? []).map((value) => value.trim());
      const ccHeader = firstHeader(headers, 'cc');

      const email: ProviderReceivedEmail = {
        id: event._id,
        from: firstHeader(headers, 'from') ?? event.envelope_sender ?? '',
        to,
        cc: ccHeader ? ccHeader.split(',').map((value) => value.trim()) : [],
        bcc: [],
        subject: firstHeader(headers, 'subject') ?? '',
        html: event.body?.html ?? null,
        text: event.body?.plaintext ?? null,
        headers: Object.fromEntries(Object.entries(headers).map(([key, values]) => [key, values.join(', ')])),
        messageId: firstHeader(headers, 'message-id') ?? event.message_id ?? null,
        inReplyTo: firstHeader(headers, 'in-reply-to'),
        references: (firstHeader(headers, 'references') ?? '')
          .match(/<[^>]+>/g)
          ?.map((value) => value) ?? [],
        deletionUrl: (event as { deletion_url?: string }).deletion_url ?? null,
        createdAt: event.processed_at ? new Date(event.processed_at * 1000).toISOString() : new Date().toISOString(),
        attachments: (event.attachments ?? []).map((attachment) => ({
          id: attachment.content_id?.replace(/[<>]/g, '') || attachment.filename,
          filename: attachment.filename,
          contentType: attachment.content_type ?? 'application/octet-stream',
          size: attachment.size ?? null,
          contentId: attachment.content_id ?? null,
          downloadUrl: attachment.url,
        })),
      };
      return email;
    },

    async finalizeInbound(email) {
      // Ask Maileroo to purge its 72 hour copy once we have everything.
      if (email.deletionUrl) {
        await fetch(email.deletionUrl, { method: 'DELETE' }).catch(() => null);
      }
    },

    async verifyWebhook(payload, headers, secret) {
      const signature = headers.get('x-maileroo-signature') ?? '';
      const ok = await verifyMailerooSignature(secret || webhookSecret, payload, signature);
      if (!ok) throw new Error('Invalid Maileroo signature');
      const parsed = JSON.parse(payload) as {
        event_type?: string;
        event_time?: number;
        message_id?: string;
        message_reference_id?: string;
      };
      const mapped = STATUS_EVENT_MAP[parsed.event_type ?? ''] ?? 'sent';
      return {
        type: `email.${mapped}`,
        createdAt: parsed.event_time ? new Date(parsed.event_time * 1000).toISOString() : undefined,
        data: {
          email_id: parsed.message_reference_id,
          message_id: parsed.message_id,
          ...parsed,
        },
      };
    },

    async listDomains() {
      const body = await accountGet('/domains');
      const rows = Array.isArray(body.data) ? body.data : ((body.data as { domains?: unknown[] })?.domains ?? []);
      return (rows as Record<string, unknown>[]).map((row) => {
        const status = String(row.status ?? row.verification_status ?? 'unknown');
        const verified = ['verified', 'active', 'enabled'].includes(status.toLowerCase());
        return {
          id: String(row.id ?? row.domain ?? ''),
          name: String(row.domain ?? row.name ?? ''),
          status,
          region: String(row.region ?? ''),
          sending: verified ? 'enabled' : 'pending',
          receiving: String(row.inbound_status ?? (verified ? 'enabled' : 'pending')),
        };
      });
    },

    async listWebhooks() {
      const body = await accountGet('/webhooks');
      const rows = Array.isArray(body.data) ? body.data : [];
      return (rows as Record<string, unknown>[]).map((row) => ({
        id: String(row.id ?? ''),
        endpoint: String(row.callback_url ?? row.endpoint ?? ''),
        events: (row.event_types as string[] | undefined) ?? null,
        status: row.status ? String(row.status) : undefined,
      }));
    },

    async createWebhook({ endpoint, events }) {
      const body = await accountSend('POST', '/webhooks', { callback_url: endpoint, event_types: events });
      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        id: String(data.id ?? ''),
        endpoint,
        events,
        signingSecret: String(data.signing_secret ?? data.shared_secret ?? ''),
      };
    },

    async deleteWebhook(id) {
      await accountSend('DELETE', `/webhooks/${encodeURIComponent(id)}`);
    },

    async listSuppressions() {
      const body = await accountGet('/suppressions');
      const rows = (body.data as { suppressions?: Record<string, unknown>[] } | undefined)?.suppressions ?? [];
      return rows.map((row) => ({
        id: String(row.id ?? ''),
        email: String(row.email_address ?? row.email ?? ''),
        reason: row.reason ? String(row.reason) : null,
        createdAt: String(row.created_at ?? ''),
      }));
    },

    async addSuppression(email, reason) {
      await accountSend('POST', '/suppressions', { email_address: email, ...(reason ? { reason } : {}) });
    },

    async removeSuppression(idOrEmail) {
      await accountSend('DELETE', `/suppressions/${encodeURIComponent(idOrEmail)}`);
    },

    async getMetrics(days) {
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      const body = await accountGet(
        `/statistics?start_date=${start.toISOString().slice(0, 10)}&end_date=${end.toISOString().slice(0, 10)}`,
      );
      const data = (body.data ?? {}) as Record<string, unknown>;
      const source = (data.stats ?? data.totals ?? data) as Record<string, unknown>;
      const totals: Record<string, number> = {};
      for (const [key, value] of Object.entries(source)) {
        if (typeof value === 'number') totals[key] = value;
      }
      return { startDate: start.toISOString(), endDate: end.toISOString(), totals };
    },
  };
}

/** Async signature check used by the webhook route for Maileroo status events. */
export async function verifyMailerooSignature(secret: string, payload: string, signature: string): Promise<boolean> {
  if (!secret || !signature) return false;
  const expected = await hmacHex(secret, payload);
  return timingSafeEqual(expected, signature);
}
