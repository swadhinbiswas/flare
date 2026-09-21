import { describe, expect, it } from 'vitest';
import { STATUS_RANK, shouldAdvance, statusFromEventType } from './status';
import type { MessageStatus } from './types';

describe('status ranking', () => {
  it('advances through the happy path in order', () => {
    const path: MessageStatus[] = ['queued', 'sent', 'delivered', 'opened', 'clicked'];
    for (let i = 1; i < path.length; i += 1) {
      const previous = path[i - 1] as MessageStatus;
      const next = path[i] as MessageStatus;
      expect(shouldAdvance(previous, next)).toBe(true);
    }
  });

  it('never walks a status backwards', () => {
    expect(shouldAdvance('opened', 'delivered')).toBe(false);
    expect(shouldAdvance('delivered', 'sent')).toBe(false);
    expect(shouldAdvance('clicked', 'opened')).toBe(false);
  });

  it('treats failures as terminal', () => {
    for (const bad of ['bounced', 'complained', 'failed', 'canceled'] as MessageStatus[]) {
      expect(shouldAdvance('opened', bad)).toBe(true);
      expect(shouldAdvance(bad, 'delivered')).toBe(false);
      expect(shouldAdvance(bad, 'clicked')).toBe(false);
    }
  });

  it('keeps scheduled below sent so the first webhook can move it on', () => {
    expect(STATUS_RANK.scheduled).toBeLessThan(STATUS_RANK.sent);
    expect(shouldAdvance('scheduled', 'sent')).toBe(true);
    expect(shouldAdvance('scheduled', 'canceled')).toBe(true);
  });

  it('maps provider event names onto the vocabulary', () => {
    expect(statusFromEventType('email.delivered')).toBe('delivered');
    expect(statusFromEventType('email.bounced')).toBe('bounced');
    expect(statusFromEventType('email.canceled')).toBe('canceled');
    expect(statusFromEventType('email.not_a_thing')).toBeNull();
  });
});
