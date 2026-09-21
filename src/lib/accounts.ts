import { env } from 'cloudflare:workers';
import { queryAll, queryOne, run } from './db';
import { decryptSecrets, encryptSecrets } from './vault';

/**
 * Mail accounts come from two places: rows in `mail_accounts` (created from
 * Settings, secrets encrypted at rest) and one synthesised account built from
 * the RESEND_* / MAIL_* environment. The environment account always stays
 * available as `primary` unless a database row claims that id, so an existing
 * mailbox never disappears when you start adding accounts.
 */

export const ACCOUNT_COOKIE = 'flare_account';
export const DEFAULT_ACCOUNT_ID = 'primary';

export const KNOWN_PROVIDERS = ['resend', 'maileroo', 'smtp'] as const;
export type AccountProvider = (typeof KNOWN_PROVIDERS)[number];

export interface MailAccountConfig {
  id: string;
  provider: string;
  label: string;
  fromEmail: string;
  fromName: string | null;
  inboundDomain: string | null;
  source: 'env' | 'database';
  apiKeyEnv?: string;
  webhookSecretEnv?: string;
  /** Resolved secret values, decrypted for database accounts. */
  secrets: Record<string, string>;
  /** Non-secret provider options, for example SMTP host and port. */
  config: Record<string, string>;
}

export interface AccountSummary {
  id: string;
  provider: string;
  label: string;
  fromEmail: string;
  fromName: string | null;
  inboundDomain: string | null;
  configured: boolean;
  source: 'env' | 'database';
}

export interface AccountInput {
  id?: string;
  provider: string;
  label: string;
  fromEmail: string;
  fromName?: string | null;
  inboundDomain?: string | null;
  secrets?: Record<string, string>;
  config?: Record<string, string>;
}

interface AccountRow {
  id: string;
  provider: string;
  label: string;
  from_email: string;
  from_name: string | null;
  inbound_domain: string | null;
  config_json: string;
  secrets_enc: string | null;
}

export function readEnvValue(name: string | undefined | null): string {
  if (!name) return '';
  const bag = env as unknown as Record<string, string | undefined>;
  return bag[name] ?? '';
}

function providerDefaults(provider: string) {
  if (provider === 'maileroo') {
    return { apiKeyEnv: 'MAILEROO_API_KEY', webhookSecretEnv: 'MAILEROO_WEBHOOK_SECRET' };
  }
  if (provider === 'smtp') {
    return { apiKeyEnv: '', webhookSecretEnv: '' };
  }
  return { apiKeyEnv: 'RESEND_API_KEY', webhookSecretEnv: 'RESEND_WEBHOOK_SECRET' };
}

function synthesizedPrimary(): MailAccountConfig {
  const provider = (env.MAIL_PROVIDER ?? 'resend').toLowerCase();
  const defaults = providerDefaults(provider);
  return {
    id: DEFAULT_ACCOUNT_ID,
    provider,
    label: env.RESEND_INBOUND_DOMAIN ? `${provider} · ${env.RESEND_INBOUND_DOMAIN}` : provider,
    fromEmail: '',
    fromName: env.MAIL_FROM_NAME ?? null,
    inboundDomain: env.RESEND_INBOUND_DOMAIN ?? null,
    source: 'env',
    apiKeyEnv: defaults.apiKeyEnv,
    webhookSecretEnv: defaults.webhookSecretEnv,
    secrets: {},
    config: {},
  };
}

async function rowToAccount(row: AccountRow): Promise<MailAccountConfig> {
  let config: Record<string, string> = {};
  try {
    const parsed = JSON.parse(row.config_json) as unknown;
    if (parsed && typeof parsed === 'object') {
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') config[key] = value;
      }
    }
  } catch {
    // ignore malformed config
  }
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    fromEmail: row.from_email,
    fromName: row.from_name,
    inboundDomain: row.inbound_domain,
    source: 'database',
    secrets: await decryptSecrets(row.secrets_enc),
    config,
  };
}

export function accountConfigured(account: MailAccountConfig): boolean {
  if (account.provider === 'smtp') {
    return Boolean(account.config.host && account.secrets.password);
  }
  return Boolean(accountSecret(account, 'apiKey'));
}

export function accountSecret(account: MailAccountConfig, name: string): string {
  if (account.secrets[name]) return account.secrets[name] as string;
  if (name === 'apiKey') return readEnvValue(account.apiKeyEnv);
  if (name === 'webhookSecret') return readEnvValue(account.webhookSecretEnv);
  return readEnvValue(account.config[`${name}Env`]);
}

export async function listAccounts(): Promise<MailAccountConfig[]> {
  const rows = await queryAll<AccountRow>(
    'SELECT id, provider, label, from_email, from_name, inbound_domain, config_json, secrets_enc FROM mail_accounts ORDER BY sort_order, created_at',
  );
  const accounts = await Promise.all(rows.map(rowToAccount));
  if (!accounts.some((account) => account.id === DEFAULT_ACCOUNT_ID)) {
    accounts.unshift(synthesizedPrimary());
  }
  return accounts;
}

export async function getAccount(id: string | null | undefined): Promise<MailAccountConfig | null> {
  if (!id) return null;
  return (await listAccounts()).find((account) => account.id === id) ?? null;
}

export async function accountSummaries(): Promise<AccountSummary[]> {
  const accounts = await listAccounts();
  return accounts.map((account) => ({
    id: account.id,
    provider: account.provider,
    label: account.label,
    fromEmail: account.fromEmail,
    fromName: account.fromName,
    inboundDomain: account.inboundDomain,
    configured: accountConfigured(account),
    source: account.source,
  }));
}

export function readAccountCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === ACCOUNT_COOKIE) return rest.join('=') || null;
  }
  return null;
}

export async function getActiveAccountId(cookieHeader: string | null): Promise<string> {
  const accounts = await listAccounts();
  const requested = readAccountCookie(cookieHeader);
  if (requested && accounts.some((account) => account.id === requested)) return requested;
  return accounts[0]?.id ?? DEFAULT_ACCOUNT_ID;
}

export async function getActiveAccount(cookieHeader: string | null): Promise<MailAccountConfig> {
  const id = await getActiveAccountId(cookieHeader);
  return (await getAccount(id)) ?? synthesizedPrimary();
}

export function serializeAccountCookie(id: string): string {
  return [`${ACCOUNT_COOKIE}=${id}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=31536000'].join('; ');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function validateAccountInput(input: AccountInput): string | null {
  if (!KNOWN_PROVIDERS.includes(input.provider as AccountProvider)) {
    return `Provider must be one of: ${KNOWN_PROVIDERS.join(', ')}`;
  }
  if (!input.label?.trim()) return 'A label is required.';
  if (!input.fromEmail?.trim()) return 'A From address is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.fromEmail.trim())) return 'The From address is not valid.';
  if (input.provider === 'smtp') {
    if (!input.config?.host?.trim()) return 'SMTP needs a host.';
    if (!input.secrets?.password?.trim()) return 'SMTP needs a password.';
  } else if (!input.secrets?.apiKey?.trim()) {
    return 'An API key is required.';
  }
  return null;
}

export async function createAccount(input: AccountInput): Promise<MailAccountConfig> {
  const problem = validateAccountInput(input);
  if (problem) throw new Error(problem);

  const base = input.id?.trim() || slugify(input.label) || crypto.randomUUID();
  let id = base;
  let suffix = 2;
  while (await getAccountRow(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }

  await run(
    `INSERT INTO mail_accounts (id, provider, label, from_email, from_name, inbound_domain, config_json, secrets_enc, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.provider,
      input.label.trim(),
      input.fromEmail.trim(),
      input.fromName?.trim() || null,
      input.inboundDomain?.trim() || null,
      JSON.stringify(input.config ?? {}),
      await encryptSecrets(input.secrets ?? {}),
      Date.now(),
    ],
  );

  const account = await getAccount(id);
  if (!account) throw new Error('Account insert did not persist');
  return account;
}

async function getAccountRow(id: string): Promise<AccountRow | null> {
  return queryOne<AccountRow>('SELECT * FROM mail_accounts WHERE id = ?', [id]);
}

export async function deleteAccount(id: string): Promise<boolean> {
  const row = await getAccountRow(id);
  if (!row) return false;
  await run('DELETE FROM mail_accounts WHERE id = ?', [id]);
  return true;
}
