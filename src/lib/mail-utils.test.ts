import { describe, expect, it } from 'vitest';
import {
  emailOf,
  headerValue,
  htmlToPreview,
  nameOf,
  normalizeSubject,
  normalizeComposeHtml,
  parseAddressList,
  parseReferences,
  previewFrom,
  renderComposeBody,
  serializeAddressList,
  subjectsMatch,
} from './mail-utils';

describe('subject normalisation', () => {
  it('strips reply and forward prefixes repeatedly', () => {
    expect(normalizeSubject('Re: Design review')).toBe('Design review');
    expect(normalizeSubject('RE: Fwd: Re: Notes')).toBe('Notes');
    expect(normalizeSubject('Re:Re:Re:  Spaced   out ')).toBe('Spaced out');
  });

  it('matches threads across prefixes and case', () => {
    expect(subjectsMatch('Re: Invoice #4', 'invoice #4')).toBe(true);
    expect(subjectsMatch('Re: Invoice #4', 'Invoice #5')).toBe(false);
    expect(subjectsMatch('', '')).toBe(false);
  });
});

describe('addresses', () => {
  it('extracts the email and display name', () => {
    expect(emailOf('Priya Raman <Priya@Example.com>')).toBe('priya@example.com');
    expect(emailOf('plain@example.com')).toBe('plain@example.com');
    expect(nameOf('Priya Raman <priya@example.com>')).toBe('Priya Raman');
    expect(nameOf('priya@example.com')).toBe('priya');
  });

  it('deduplicates lists and round-trips JSON', () => {
    const serialized = serializeAddressList(['a@x.com', 'A <a@x.com>', 'b@x.com']);
    expect(parseAddressList(serialized)).toEqual(['a@x.com', 'b@x.com']);
  });

  it('tolerates legacy comma separated values', () => {
    expect(parseAddressList('a@x.com, b@x.com')).toEqual(['a@x.com', 'b@x.com']);
    expect(parseAddressList(null)).toEqual([]);
  });
});

describe('headers', () => {
  it('looks up header names case-insensitively and flattens arrays', () => {
    const headers = { 'Message-ID': ['<abc@x>'], 'In-Reply-To': '<def@x>' };
    expect(headerValue(headers, 'message-id')).toBe('<abc@x>');
    expect(headerValue(headers, 'IN-REPLY-TO')).toBe('<def@x>');
    expect(headerValue(headers, 'missing')).toBeNull();
  });

  it('parses references into message ids', () => {
    expect(parseReferences('<a@x> <b@x>')).toEqual(['a@x', 'b@x']);
    expect(parseReferences(null)).toEqual([]);
  });
});

describe('bodies', () => {
  it('builds a preview from text first, then stripped html', () => {
    expect(previewFrom('plain body', '<p>html</p>')).toBe('plain body');
    expect(previewFrom(null, '<p>Hello <b>there</b></p>')).toBe('Hello there');
    expect(htmlToPreview('<style>x{}</style><p>Visible</p>')).toBe('Visible');
  });

  it('renders markdown-lite and escapes html', () => {
    const html = renderComposeBody('**bold** and `code`\n\n<script>alert(1)</script>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops the legacy hardcoded compose color', () => {
    const legacy = '<div style="color:#111827"><p>old</p></div>';
    expect(normalizeComposeHtml(legacy)).toContain('color:inherit');
    expect(normalizeComposeHtml(legacy)).not.toContain('#111827');
    expect(normalizeComposeHtml(null)).toBeNull();
  });
});
