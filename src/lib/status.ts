import type { MessageStatus } from './types';

/**
 * Monotonic ranking: a late webhook event must never move `messages.status`
 * backwards (e.g. an `email.sent` echo arriving after `email.delivered`).
 * Bounced / complained / failed all outrank the happy path because they are
 * terminal.
 */
export const STATUS_RANK: Record<MessageStatus, number> = {
  queued: 0,
  scheduled: 0,
  sent: 1,
  received: 1,
  delivered: 2,
  delivery_delayed: 2,
  opened: 3,
  clicked: 4,
  bounced: 5,
  complained: 5,
  failed: 5,
  canceled: 5,
};

export const TERMINAL_BAD_STATUSES: MessageStatus[] = ['bounced', 'complained', 'failed'];

export function statusFromEventType(type: string): MessageStatus | null {
  const status = type.replace(/^email\./, '') as MessageStatus;
  if (status in STATUS_RANK) return status;
  return null;
}

export function isTerminalBad(status: MessageStatus): boolean {
  return TERMINAL_BAD_STATUSES.includes(status);
}

/** Should `next` replace `current` in messages.status? */
export function shouldAdvance(current: MessageStatus, next: MessageStatus): boolean {
  return STATUS_RANK[next] > STATUS_RANK[current];
}
