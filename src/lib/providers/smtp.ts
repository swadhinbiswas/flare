import { addressOf, buildMimeMessage } from '../smtp/mime';
import { smtpSend } from '../smtp/client';
import type { MailProvider, ProviderWebhookEvent } from './types';

export interface SmtpProviderConfig {
  host?: string;
  port?: number;
  secure?: 'tls' | 'starttls' | 'none';
  username?: string;
  password?: string;
  fromEmail?: string;
  fromName?: string;
}

/**
 * Send-only provider for any SMTP relay. Workers cannot accept inbound SMTP, so
 * receiving keeps running through the account that owns the domain's MX record;
 * an SMTP account is a sending identity, not a mailbox.
 */
export function createSmtpProvider(config: SmtpProviderConfig = {}): MailProvider {
  const unsupported = (feature: string): never => {
    throw new Error(`SMTP accounts cannot do ${feature}; they only send.`);
  };

  return {
    id: 'smtp',
    label: 'SMTP',

    isConfigured() {
      return Boolean(config.host && (config.password || !config.username));
    },

    async send(message) {
      if (message.scheduledAt) {
        throw new Error('SMTP cannot schedule a send. Use a provider account for scheduled mail.');
      }
      const recipients = [
        ...message.to.map(addressOf),
        ...(message.cc ?? []).map(addressOf),
        ...(message.bcc ?? []).map(addressOf),
      ];
      const raw = buildMimeMessage({
        from: message.from,
        to: message.to,
        cc: message.cc ?? [],
        bcc: message.bcc ?? [],
        subject: message.subject,
        html: message.html ?? null,
        text: message.text ?? null,
        headers: message.headers,
        attachments: message.attachments?.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        })),
      });
      await smtpSend(
        {
          host: config.host as string,
          port: config.port ?? 465,
          secure: config.secure ?? 'tls',
          username: config.username,
          password: config.password,
        },
        { from: addressOf(message.from), to: recipients },
        raw,
      );
      return { id: `smtp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` };
    },

    async getMessageStatus() {
      // SMTP gives no delivery feedback beyond the accepted handoff.
      return null;
    },

    listReceived() {
      return unsupported('receive mail');
    },
    getReceived() {
      return unsupported('receive mail');
    },
    getAttachmentContent() {
      return unsupported('receive mail');
    },
    verifyWebhook() {
      return unsupported('webhooks');
    },
    async listDomains() {
      return [];
    },
    async listWebhooks() {
      return [];
    },
    async createWebhook() {
      return unsupported('webhooks');
    },
    async deleteWebhook() {
      return unsupported('webhooks');
    },
    async listSuppressions() {
      return [];
    },
    async removeSuppression() {
      return unsupported('suppression management');
    },
    async getMetrics() {
      return { startDate: '', endDate: '', totals: {} };
    },
  };
}

export type { ProviderWebhookEvent };
