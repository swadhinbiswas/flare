import { env } from 'cloudflare:workers';

/**
 * Mail accounts are configuration, not database rows, so provider secrets stay
 * in Wrangler secrets. MAIL_ACCOUNTS is a JSON array; when it is empty the app
 * synthesises one account from the RESEND_* / MAIL_* environment. The active
 * account lives in a cookie and scopes threads and messages.
 */

export const ACCOUNT_COOKIE = 'rflare_account';
export const DEFAULT_ACCOUNT_ID = 'primary';

const KNOWN_PROVIDERS = ['resend', 'maileroo'];

export interface MailAccountConfig {
  id: string;
  provider: string;
  label: string;
  /** Empty means "use the signed-in user's address". */
  fromEmail: string;
  fromName: string | null;
  inboundDomain: string | null;
  apiKeyEnv: string;
  webhookSecretEnv: string;
}

export interface AccountSummary {
  id: string;
  provider: string;
  label: string;
  fromEmail: string;
  fromName: string | null;
  inboundDomain: string | null;
  configured: boolean;
}

export function readEnvValue(name: string | undefined | null): string {
  if (!name) return '';
  const bag = env as unknown as Record<string, string | undefined>;
  return bag[name] ?? '';
}

function providerDefaults(provider: string): { apiKeyEnv: string; webhookSecretEnv: string; fromName: string | null; inboundDomain: string | null } {
  if (provider === 'maileroo') {
    return {
      apiKeyEnv: 'MAILEROO_API_KEY',
      webhookSecretEnv: 'MAILEROO_WEBHOOK_SECRET',
      fromName: env.MAIL_FROM_NAME ?? null,
      inboundDomain: env.RESEND_INBOUND_DOMAIN ?? null,
    };
  }
  return {
    apiKeyEnv: 'RESEND_API_KEY',
    webhookSecretEnv: 'RESEND_WEBHOOK_SECRET',
    fromName: env.MAIL_FROM_NAME ?? null,
    inboundDomain: env.RESEND_INBOUND_DOMAIN ?? null,
  };
}

function synthesizedPrimary(): MailAccountConfig {
  const provider = (env.MAIL_PROVIDER ?? 'resend').toLowerCase();
  const defaults = providerDefaults(provider);
  return {
    id: DEFAULT_ACCOUNT_ID,
    provider,
    label: env.RESEND_INBOUND_DOMAIN ? `${provider} · ${env.RESEND_INBOUND_DOMAIN}` : provider,
    fromEmail: '',
    fromName: defaults.fromName,
    inboundDomain: defaults.inboundDomain,
    apiKeyEnv: defaults.apiKeyEnv,
    webhookSecretEnv: defaults.webhookSecretEnv,
  };
}

function parseAccounts(): MailAccountConfig[] {
  const raw = (env.MAIL_ACCOUNTS ?? '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const accounts: MailAccountConfig[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const id = String(record.id ?? '').trim();
      const provider = String(record.provider ?? '').trim().toLowerCase();
      if (!id || !KNOWN_PROVIDERS.includes(provider)) continue;
      const defaults = providerDefaults(provider);
      accounts.push({
        id,
        provider,
        label: String(record.label ?? id),
        fromEmail: String(record.fromEmail ?? ''),
        fromName: record.fromName ? String(record.fromName) : defaults.fromName,
        inboundDomain: record.inboundDomain ? String(record.inboundDomain) : defaults.inboundDomain,
        apiKeyEnv: String(record.apiKeyEnv ?? defaults.apiKeyEnv),
        webhookSecretEnv: String(record.webhookSecretEnv ?? defaults.webhookSecretEnv),
      });
    }
    return accounts;
  } catch (error) {
    console.warn('[accounts] MAIL_ACCOUNTS is not valid JSON', error);
    return [];
  }
}

export function listAccounts(): MailAccountConfig[] {
  const configured = parseAccounts();
  return configured.length > 0 ? configured : [synthesizedPrimary()];
}

export function getAccount(id: string | null | undefined): MailAccountConfig | null {
  if (!id) return null;
  return listAccounts().find((account) => account.id === id) ?? null;
}

export function accountSecret(account: MailAccountConfig, kind: 'apiKey' | 'webhookSecret'): string {
  const name = kind === 'apiKey' ? account.apiKeyEnv : account.webhookSecretEnv;
  return readEnvValue(name);
}

export function readAccountCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === ACCOUNT_COOKIE) return rest.join('=') || null;
  }
  return null;
}

export function getActiveAccountId(cookieHeader: string | null): string {
  const accounts = listAccounts();
  const requested = readAccountCookie(cookieHeader);
  if (requested && accounts.some((account) => account.id === requested)) return requested;
  return accounts[0]?.id ?? DEFAULT_ACCOUNT_ID;
}

export function getActiveAccount(cookieHeader: string | null): MailAccountConfig {
  return getAccount(getActiveAccountId(cookieHeader)) ?? listAccounts()[0] ?? synthesizedPrimary();
}

export function serializeAccountCookie(id: string): string {
  return [`${ACCOUNT_COOKIE}=${id}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=31536000'].join('; ');
}

export function accountSummaries(): AccountSummary[] {
  return listAccounts().map((account) => ({
    id: account.id,
    provider: account.provider,
    label: account.label,
    fromEmail: account.fromEmail,
    fromName: account.fromName,
    inboundDomain: account.inboundDomain,
    configured: Boolean(accountSecret(account, 'apiKey')),
  }));
}
