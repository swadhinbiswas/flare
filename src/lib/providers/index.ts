import { env } from 'cloudflare:workers';
import { accountSecret } from '../accounts';
import { createMailerooProvider } from './maileroo';
import { createResendProvider } from './resend';
import { createSmtpProvider } from './smtp';
import type { MailProvider } from './types';
import type { MailAccountConfig } from '../accounts';

export type { MailProvider } from './types';

function build(account: MailAccountConfig | null, envProvider: string): MailProvider {
  const providerId = (account?.provider ?? envProvider).toLowerCase();

  if (providerId === 'smtp') {
    return createSmtpProvider({
      host: account?.config.host,
      port: account?.config.port ? Number(account.config.port) : undefined,
      secure: (account?.config.secure as 'tls' | 'starttls' | 'none' | undefined) ?? 'tls',
      username: (account ? accountSecret(account, 'username') : '') || undefined,
      password: (account ? accountSecret(account, 'password') : '') || undefined,
      fromEmail: account?.fromEmail,
      fromName: account?.fromName ?? undefined,
    });
  }

  // Empty values fall through to the provider's environment fallback, so a
  // database account without a stored webhook secret still honours
  // MAILEROO_WEBHOOK_SECRET / RESEND_WEBHOOK_SECRET.
  const apiKey = (account ? accountSecret(account, 'apiKey') : '') || undefined;
  const webhookSecret = (account ? accountSecret(account, 'webhookSecret') : '') || undefined;

  if (providerId === 'maileroo') return createMailerooProvider({ apiKey, webhookSecret });
  return createResendProvider({ apiKey, webhookSecret });
}

/**
 * Resolves a mail backend. Pass an account to use its provider, config and
 * secrets (decrypted from the vault, or read from the environment for the
 * synthesised primary account). Built per call on purpose: the SDK clients and
 * credentials underneath are cached, and a module-level cache here served stale
 * code during hot reloads.
 */
export function getMailProvider(account?: MailAccountConfig | null): MailProvider {
  const envProvider = (env.MAIL_PROVIDER ?? 'resend').toLowerCase();
  return build(account ?? null, envProvider);
}
