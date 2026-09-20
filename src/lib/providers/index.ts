import { env } from 'cloudflare:workers';
import { createResendProvider } from './resend';
import type { MailProvider } from './types';

export type { MailProvider } from './types';

let cached: MailProvider | null = null;

/** Resolves the configured mail backend. `MAIL_PROVIDER` defaults to resend. */
export function getMailProvider(): MailProvider {
  if (cached) return cached;
  const id = (env.MAIL_PROVIDER ?? 'resend').toLowerCase();
  switch (id) {
    case 'resend':
    default:
      cached = createResendProvider();
      break;
  }
  return cached;
}
