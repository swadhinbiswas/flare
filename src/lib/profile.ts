import { getBlobStore } from './storage';
import { queryOne, run } from './db';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarKey: string | null;
  avatarContentType: string | null;
}

/** Accepts http(s) and small data:image URLs; returns null for anything else. */
export function normalizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url) return null;
  if (url.length > 2048) return null;
  if (/^https?:\/\/[^\s]+$/i.test(url)) return url;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(url)) return url;
  return null;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const row = await queryOne<{
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    avatar_key: string | null;
    avatar_content_type: string | null;
  }>('SELECT id, email, display_name, avatar_url, avatar_key, avatar_content_type FROM users WHERE id = ?', [userId]);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    avatarKey: row.avatar_key,
    avatarContentType: row.avatar_content_type,
  };
}

export async function updateDisplayName(userId: string, displayName: string | null): Promise<void> {
  const value = displayName?.trim() ? displayName.trim().slice(0, 120) : null;
  await run('UPDATE users SET display_name = ? WHERE id = ?', [value, userId]);
}

export async function setAvatar(userId: string, body: ArrayBuffer, contentType: string): Promise<void> {
  const previous = await getProfile(userId);
  const extension = contentType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
  const key = `avatars/${userId}/${Date.now()}.${extension}`;
  await getBlobStore().put(key, body, contentType);
  // An upload replaces any external URL.
  await run('UPDATE users SET avatar_key = ?, avatar_content_type = ?, avatar_url = NULL WHERE id = ?', [
    key,
    contentType,
    userId,
  ]);
  if (previous?.avatarKey && previous.avatarKey !== key) {
    await getBlobStore().delete([previous.avatarKey]);
  }
}

export async function updateAvatarUrl(userId: string, url: string | null): Promise<void> {
  const normalized = normalizeAvatarUrl(url);
  const profile = await getProfile(userId);
  await run('UPDATE users SET avatar_url = ? WHERE id = ?', [normalized, userId]);
  if (normalized && profile?.avatarKey) {
    await getBlobStore().delete([profile.avatarKey]);
    await run('UPDATE users SET avatar_key = NULL, avatar_content_type = NULL WHERE id = ?', [userId]);
  }
}

export async function clearAvatar(userId: string): Promise<void> {
  const profile = await getProfile(userId);
  if (profile?.avatarKey) await getBlobStore().delete([profile.avatarKey]);
  await run('UPDATE users SET avatar_key = NULL, avatar_content_type = NULL, avatar_url = NULL WHERE id = ?', [
    userId,
  ]);
}

export async function readAvatar(profile: Profile): Promise<Response | null> {
  if (!profile.avatarKey) return null;
  const object = await getBlobStore().get(profile.avatarKey);
  if (!object) return null;
  return new Response(object.body, {
    headers: {
      'content-type': object.contentType || profile.avatarContentType || 'application/octet-stream',
      'content-length': String(object.size),
      'cache-control': 'private, max-age=60',
    },
  });
}
