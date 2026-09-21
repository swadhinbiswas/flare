import { describe, expect, it } from 'vitest';
import { configErrorMessage, missingRuntimeConfig } from './config';

describe('runtime config check', () => {
  it('passes when both values are present', () => {
    expect(
      missingRuntimeConfig({ TURSO_DATABASE_URL: 'libsql://x', SESSION_SECRET: 'secret' }),
    ).toEqual([]);
  });

  it('names everything that is missing or blank', () => {
    expect(missingRuntimeConfig({})).toEqual(['TURSO_DATABASE_URL', 'SESSION_SECRET']);
    expect(missingRuntimeConfig({ TURSO_DATABASE_URL: '   ', SESSION_SECRET: 'x' })).toEqual([
      'TURSO_DATABASE_URL',
    ]);
  });

  it('words the error for the client', () => {
    expect(configErrorMessage(['SESSION_SECRET'])).toContain('SESSION_SECRET');
  });
});
