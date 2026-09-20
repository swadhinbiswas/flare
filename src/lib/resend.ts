import { env } from 'cloudflare:workers';
import { Resend } from 'resend';

let cached: Resend | null = null;
let cachedKey = '';

export function getResend(): Resend {
  const key = env.RESEND_API_KEY;
  if (!cached || cachedKey !== key) {
    cached = new Resend(key);
    cachedKey = key;
  }
  return cached;
}

export function fromAddress(email: string): string {
  const name = env.MAIL_FROM_NAME?.trim() || 'RFLARE';
  return `${name} <${email}>`;
}
