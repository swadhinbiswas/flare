import { env } from 'cloudflare:workers';
import { Resend } from 'resend';

const cache = new Map<string, Resend>();

export function getResend(apiKey?: string): Resend {
  const key = apiKey || env.RESEND_API_KEY;
  const cached = cache.get(key);
  if (cached) return cached;
  const client = new Resend(key);
  cache.set(key, client);
  return client;
}

export function fromAddress(email: string): string {
  const name = env.MAIL_FROM_NAME?.trim() || 'FLARE';
  return `${name} <${email}>`;
}
