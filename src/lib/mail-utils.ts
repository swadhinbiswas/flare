/**
 * Small mail-specific helpers shared by the API routes, pages and webhook
 * handler. Kept dependency-free so they are trivially unit-testable.
 */

const SUBJECT_PREFIX = /^\s*(?:(?:re|fwd?|aw|sv|vs)\s*:\s*)+/i;

/** Strip Re:/Fwd:/Aw: prefixes (repeatedly) and collapse whitespace. */
export function normalizeSubject(subject: string | null | undefined): string {
  if (!subject) return '';
  let value = subject.replace(SUBJECT_PREFIX, '').trim();
  // Some clients nest prefixes without a space, handle "Re:Re:" too.
  while (SUBJECT_PREFIX.test(value)) value = value.replace(SUBJECT_PREFIX, '').trim();
  return value.replace(/\s+/g, ' ');
}

export function subjectsMatch(a: string, b: string): boolean {
  const left = normalizeSubject(a).toLowerCase();
  const right = normalizeSubject(b).toLowerCase();
  if (!left || !right) return false;
  return left === right;
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Parse the display address used in the `from`/`to` columns into its email part. */
export function emailOf(address: string): string {
  const trimmed = address.trim();
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  return trimmed.toLowerCase();
}

/** Extract a display name from `Name <email@example.com>`, if present. */
export function nameOf(address: string): string {
  const trimmed = address.trim();
  const angle = trimmed.match(/^\s*(?:"?([^"<]*)"?)\s*<[^>]+>\s*$/);
  const name = angle?.[1]?.trim();
  if (name) return name;
  return emailOf(trimmed).split('@')[0] ?? trimmed;
}

/**
 * Turn arbitrary user input into a From header. If the address already has a
 * display name we keep it; otherwise we prefix the app's display name.
 */
export function formatFrom(address: string, displayName: string): string {
  if (/<[^>]+>/.test(address)) return address.trim();
  const name = displayName.trim();
  return name ? `${name} <${address.trim()}>` : address.trim();
}

export function parseAddressList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
  } catch {
    // Fall through to comma splitting for legacy/plain values.
  }
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function serializeAddressList(values: string[]): string {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const key = emailOf(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(value.trim());
  }
  return JSON.stringify(unique);
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/** Rough plain-text preview from an HTML body, used by the thread list. */
export function htmlToPreview(html: string | null | undefined): string {
  if (!html) return '';
  return decodeHtmlEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function previewFrom(text: string | null | undefined, html: string | null | undefined): string {
  const source = text && text.trim() ? text : htmlToPreview(html);
  return source.replace(/\s+/g, ' ').trim().slice(0, 240);
}

/**
 * Very small markdown-lite renderer for the compose body: paragraphs, links,
 * bold/italic/code and line breaks. Everything is escaped first, so this is
 * safe against HTML injection from the compose form.
 */
export function renderComposeBody(value: string): string {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const blocks = escaped.split(/\n{2,}/).map((block) => {
    const withBreaks = block
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br />');
    return `<p>${withBreaks}</p>`;
  });

  const html = blocks.join('\n');
  return `<div style="font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#111827">${html}</div>`;
}

/** Headers from providers are case-insensitive; Resend returns a plain object. */
export function headerValue(
  headers: Record<string, unknown> | null | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (value == null) return null;
    if (Array.isArray(value)) return value.length ? String(value[0]) : null;
    return String(value);
  }
  return null;
}

export function stripMessageId(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  return match?.[1] ? `<${match[1]}>` : value.trim() || null;
}

export function messageIdValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  return match?.[1] ?? value.trim();
}

/** Extract every referenced message id from a References header. */
export function parseReferences(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...value.matchAll(/<([^>]+)>/g)].map((m) => m[1] as string);
}
