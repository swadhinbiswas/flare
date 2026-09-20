import type { SessionUser } from './types';

/**
 * Where to load the profile picture from. An explicit URL wins over an
 * uploaded blob; returns null when neither is set.
 */
export function avatarSrc(user: Pick<SessionUser, 'avatarUrl' | 'hasAvatar'>, version?: number): string | null {
  if (user.avatarUrl) return user.avatarUrl;
  if (user.hasAvatar) return `/api/profile/avatar${version ? `?v=${version}` : ''}`;
  return null;
}
