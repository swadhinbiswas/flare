import { env } from 'cloudflare:workers';

/**
 * Small AES-GCM vault for account credentials. The key is derived from
 * SESSION_SECRET with SHA-256, the payload is `iv.ciphertext` in base64.
 * Everything secret at rest goes through here.
 */

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function vaultKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.SESSION_SECRET));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptSecrets(values: Record<string, string>): Promise<string> {
  const key = await vaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(JSON.stringify(values));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
  return `${toBase64(iv)}.${toBase64(new Uint8Array(cipher))}`;
}

export async function decryptSecrets(stored: string | null | undefined): Promise<Record<string, string>> {
  if (!stored) return {};
  const [ivPart, dataPart] = stored.split('.');
  if (!ivPart || !dataPart) return {};
  try {
    const key = await vaultKey();
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivPart) as BufferSource },
      key,
      fromBase64(dataPart) as BufferSource,
    );
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const values: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') values[name] = value;
    }
    return values;
  } catch (error) {
    console.warn('[vault] could not decrypt account secrets', error);
    return {};
  }
}
