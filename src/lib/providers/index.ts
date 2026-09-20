import { env } from 'cloudflare:workers';
import { createMailerooProvider } from './maileroo';
import { createResendProvider } from './resend';
import type { MailProvider } from './types';
import type { MailAccountConfig } from '../accounts';

export type { MailProvider } from './types';

const cache = new Map<string, MailProvider>();

function build(account: MailAccountConfig | null, envProvider: string): MailProvider {
  const providerId = (account?.provider ?? envProvider).toLowerCase();
  const apiKey = account ? readSecret(account.apiKeyEnv) : undefined;
  const webhookSecret = account ? readSecret(account.webhookSecretEnv) : undefined;

  switch (providerId) {
    case 'maileroo':
      return createMailerooProvider({ apiKey, webhookSecret });
    case 'resend':
    default:
      return createResendProvider({ apiKey, webhookSecret });
  }
}

function readSecret(name: string): string {
  const bag = env as unknown as Record<string, string | undefined>;
  return bag[name] ?? '';
}

/**
 * Resolves a mail backend. Pass an account to use its provider and secrets;
 * without one it falls back to MAIL_PROVIDER and the RESEND_* environment.
 */
export function getMailProvider(account?: MailAccountConfig | null): MailProvider {
  const envProvider = (env.MAIL_PROVIDER ?? 'resend').toLowerCase();
  const key = account ? `${account.id}:${account.provider}` : `env:${envProvider}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const provider = build(account ?? null, envProvider);
  cache.set(key, provider);
  return provider;
}
