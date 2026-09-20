import { env } from 'cloudflare:workers';
import { createMailerooProvider } from './maileroo';
import { createResendProvider } from './resend';
import type { MailProvider } from './types';
import type { MailAccountConfig } from '../accounts';

export type { MailProvider } from './types';

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
  // Built per call on purpose: the providers are thin wrappers (the SDK clients
  // and credentials they touch are cached), and a module-level cache here served
  // stale code during hot reloads.
  const envProvider = (env.MAIL_PROVIDER ?? 'resend').toLowerCase();
  return build(account ?? null, envProvider);
}
