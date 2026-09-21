import { describe, expect, it } from 'vitest';
import { addressOf, buildMimeMessage } from './mime';

const base = {
  from: 'Swadhin Biswas <eu@swadhin.cv>',
  to: ['friend@example.com'],
  cc: ['copy@example.com'],
  bcc: ['hidden@example.com'],
  subject: 'Hello',
  text: 'plain body',
  html: '<p>html body</p>',
};

describe('mime builder', () => {
  it('writes the envelope headers and hides bcc', () => {
    const message = buildMimeMessage(base);
    expect(message).toContain('From: Swadhin Biswas <eu@swadhin.cv>');
    expect(message).toContain('To: friend@example.com');
    expect(message).toContain('Cc: copy@example.com');
    expect(message).not.toMatch(/^Bcc:/m);
    expect(message).toContain('Subject: Hello');
    expect(message).toContain('MIME-Version: 1.0');
    expect(message).toMatch(/Message-ID: </);
  });

  it('encodes a non-ascii subject', () => {
    const message = buildMimeMessage({ ...base, subject: 'Grüße aus Indien' });
    expect(message).toMatch(/Subject: =\?UTF-8\?B\?/);
  });

  it('builds alternative parts without attachments', () => {
    const message = buildMimeMessage(base);
    expect(message).toContain('Content-Type: multipart/alternative');
    expect(message).not.toContain('multipart/mixed');
    expect(message).toContain('Content-Type: text/plain; charset=utf-8');
    expect(message).toContain('Content-Type: text/html; charset=utf-8');
  });

  it('wraps attachments in multipart/mixed with base64 content', () => {
    const message = buildMimeMessage({
      ...base,
      attachments: [{ filename: 'notes.txt', content: 'aGVsbG8=', contentType: 'text/plain' }],
    });
    expect(message).toContain('Content-Type: multipart/mixed');
    expect(message).toContain('Content-Disposition: attachment; filename="notes.txt"');
    expect(message).toContain('aGVsbG8=');
  });

  it('extracts the envelope address from a display address', () => {
    expect(addressOf('Swadhin Biswas <eu@swadhin.cv>')).toBe('eu@swadhin.cv');
    expect(addressOf('eu@swadhin.cv')).toBe('eu@swadhin.cv');
  });
});
