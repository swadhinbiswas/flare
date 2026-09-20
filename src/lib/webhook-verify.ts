import { getResend } from './resend';

/**
 * Verifies a Resend webhook request. Must be given the RAW request body — the
 * signature is computed over the raw bytes, so re-serializing parsed JSON will
 * break verification. Throws on invalid/missing signature; callers should
 * return 400 before touching the database.
 */
export function verifyResendWebhook(payload: string, headers: Headers, webhookSecret: string) {
  return getResend().webhooks.verify({
    payload,
    headers: {
      id: headers.get('svix-id') ?? '',
      timestamp: headers.get('svix-timestamp') ?? '',
      signature: headers.get('svix-signature') ?? '',
    },
    webhookSecret,
  });
}
