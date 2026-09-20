import { env } from 'cloudflare:workers';
import type { CreateEmailOptions } from 'resend';
import { getResend } from '../resend';
import { verifyResendWebhook } from '../webhook-verify';
import { headerValue, parseReferences } from '../mail-utils';
import type {
  MailProvider,
  ProviderDomain,
  ProviderMetrics,
  ProviderReceivedEmail,
  ProviderSuppression,
  ProviderWebhook,
  ProviderWebhookEvent,
} from './types';

export interface ResendConfig {
  apiKey?: string;
  webhookSecret?: string;
}

export function createResendProvider(config: ResendConfig = {}): MailProvider {
  const webhookSecret = config.webhookSecret ?? env.RESEND_WEBHOOK_SECRET;
  const client = () => getResend(config.apiKey);

  return {
    id: 'resend',
    label: 'Resend',

    isConfigured() {
      return Boolean(env.RESEND_API_KEY);
    },

    async send(message) {
      const base = {
        from: message.from,
        to: message.to,
        ...(message.cc?.length ? { cc: message.cc } : {}),
        ...(message.bcc?.length ? { bcc: message.bcc } : {}),
        subject: message.subject,
        ...(message.attachments?.length
          ? {
              attachments: message.attachments.map((attachment) => ({
                filename: attachment.filename,
                content: attachment.content,
                ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
              })),
            }
          : {}),
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.scheduledAt ? { scheduledAt: message.scheduledAt } : {}),
      };
      // The SDK's type is a union that requires exactly one render mode, so
      // narrow explicitly instead of spreading optional keys.
      const payload: CreateEmailOptions = message.html
        ? { ...base, html: message.html, ...(message.text ? { text: message.text } : {}) }
        : { ...base, text: message.text ?? '' };
      const { data, error } = await client().emails.send(payload);
      if (error || !data?.id) throw new Error(error?.message ?? 'Resend returned no message id');
      return { id: data.id };
    },

    async cancelScheduled(providerMessageId) {
      // Resend accepts the send before it flips the message into the scheduled
      // state, so a cancel issued right after sending can fail with "Email is
      // not scheduled". Retry briefly instead of surfacing that race.
      let lastError = 'Email could not be canceled';
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const { error } = await client().emails.cancel(providerMessageId);
        if (!error) return;
        lastError = error.message;
        if (!/not scheduled/i.test(lastError)) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      throw new Error(lastError);
    },

    async getMessageStatus(providerMessageId) {
      const { data, error } = await client().emails.get(providerMessageId);
      if (error || !data) return null;
      return data.last_event ?? null;
    },

    async listReceived(limit) {
      const { data, error } = await client().emails.receiving.list({ limit });
      if (error) throw new Error(error.message);
      return data.data.map((item) => ({
        id: item.id,
        from: item.from,
        to: item.to ?? [],
        subject: item.subject ?? '',
        createdAt: item.created_at,
      }));
    },

    async getReceived(providerEmailId) {
      const { data, error } = await client().emails.receiving.get(providerEmailId, { html_format: 'cid' });
      if (error || !data) {
        throw new Error(`Could not fetch received email ${providerEmailId}: ${error?.message ?? 'unknown error'}`);
      }
      const headers = (data.headers ?? {}) as Record<string, string>;
      const email: ProviderReceivedEmail = {
        id: data.id,
        from: data.from,
        to: data.to ?? [],
        cc: data.cc ?? [],
        bcc: data.bcc ?? [],
        subject: data.subject ?? '',
        html: data.html ?? null,
        text: data.text ?? null,
        headers,
        messageId: headerValue(headers, 'message-id') ?? data.message_id ?? null,
        inReplyTo: headerValue(headers, 'in-reply-to'),
        references: parseReferences(headerValue(headers, 'references')),
        createdAt: data.created_at,
        attachments: (data.attachments ?? []).map((attachment) => ({
          id: attachment.id,
          filename: attachment.filename ?? 'attachment',
          contentType: attachment.content_type ?? 'application/octet-stream',
          size: attachment.size ?? null,
          contentId: attachment.content_id,
        })),
      };
      return email;
    },

    async getAttachmentContent({ emailId, attachmentId }) {
      const { data, error } = await client().emails.receiving.attachments.get({ emailId, id: attachmentId });
      if (error || !data?.download_url) {
        throw new Error(`Attachment ${attachmentId} has no download URL: ${error?.message ?? 'unknown error'}`);
      }
      const response = await fetch(data.download_url);
      if (!response.ok) throw new Error(`Attachment download failed with ${response.status}`);
      return response.arrayBuffer();
    },

    async verifyWebhook(payload, headers, secret) {
      const effective = secret || webhookSecret;
      return verifyResendWebhook(payload, headers, effective) as unknown as ProviderWebhookEvent;
    },

    async listDomains() {
      const { data, error } = await client().domains.list();
      if (error) throw new Error(error.message);
      return data.data.map(
        (domain): ProviderDomain => ({
          id: domain.id,
          name: domain.name,
          status: domain.status,
          region: domain.region,
          sending: domain.capabilities?.sending ?? 'unknown',
          receiving: domain.capabilities?.receiving ?? 'unknown',
        }),
      );
    },

    async listWebhooks() {
      const { data, error } = await client().webhooks.list();
      if (error) throw new Error(error.message);
      return data.data.map(
        (webhook): ProviderWebhook => ({
          id: webhook.id,
          endpoint: webhook.endpoint,
          events: webhook.events,
          status: webhook.status,
        }),
      );
    },

    async createWebhook({ endpoint, events }) {
      const { data, error } = await client().webhooks.create({ endpoint, events: events as never });
      if (error || !data) throw new Error(error?.message ?? 'Could not create webhook');
      // The create response only carries the id and signing secret.
      return { id: data.id, endpoint, events, signingSecret: data.signing_secret };
    },

    async deleteWebhook(id) {
      const { error } = await client().webhooks.remove(id);
      if (error) throw new Error(error.message);
    },

    async addSuppression(email) {
      const { error } = await client().suppressions.add({ email });
      if (error) throw new Error(error.message);
    },

    async listSuppressions() {
      const { data, error } = await client().suppressions.list({ limit: 100 });
      if (error) throw new Error(error.message);
      return data.data.map(
        (item): ProviderSuppression => ({
          id: item.id,
          email: item.email,
          reason: item.origin ?? null,
          createdAt: item.created_at,
        }),
      );
    },

    async removeSuppression(idOrEmail) {
      const { error } = await client().suppressions.remove(idOrEmail);
      if (error) throw new Error(error.message);
    },

    async getMetrics(days) {
      const end = new Date();
      const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
      const { data, error } = await client().emails.metrics({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });
      if (error) throw new Error(error.message);
      const totals: Record<string, number> = {};
      for (const [key, value] of Object.entries(data.totals ?? {})) {
        if (typeof value === 'number') totals[key] = value;
      }
      const metrics: ProviderMetrics = {
        startDate: data.start_date,
        endDate: data.end_date,
        totals,
      };
      return metrics;
    },
  };
}
