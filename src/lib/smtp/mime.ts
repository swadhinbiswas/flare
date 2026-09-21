/** Minimal MIME builder for outbound SMTP messages. */

export interface MimeAttachment {
  filename: string;
  content: string;
  contentType?: string;
}

export interface MimeInput {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string>;
  attachments?: MimeAttachment[];
}

function base64Lines(value: string): string {
  const chunks = value.match(/.{1,76}/g) ?? [];
  return chunks.join('\r\n');
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(value)))}?=`;
}

function randomToken(): string {
  return Math.random().toString(36).slice(2, 12);
}

export function addressOf(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim();
}

export function buildMimeMessage(input: MimeInput): string {
  const boundaryMixed = `mixed-${randomToken()}`;
  const boundaryAlt = `alt-${randomToken()}`;
  const hasAttachments = Boolean(input.attachments?.length);

  const lines: string[] = [];
  lines.push(`From: ${input.from}`);
  lines.push(`To: ${input.to.join(', ')}`);
  if (input.cc.length) lines.push(`Cc: ${input.cc.join(', ')}`);
  lines.push(`Subject: ${encodeHeader(input.subject)}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push(`Message-ID: <${randomToken()}.${Date.now()}@flare>`);
  lines.push('MIME-Version: 1.0');
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    // Bcc must never appear as a header; it is an envelope concern.
    if (name.toLowerCase() === 'bcc') continue;
    lines.push(`${name}: ${value}`);
  }

  const alternative = [
    `--${boundaryAlt}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(btoa(String.fromCharCode(...new TextEncoder().encode(input.text ?? '')))),
    `--${boundaryAlt}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(btoa(String.fromCharCode(...new TextEncoder().encode(input.html ?? '')))),
    `--${boundaryAlt}--`,
  ];

  if (hasAttachments) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`);
    lines.push('');
    lines.push(`--${boundaryMixed}`);
    lines.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
    lines.push('');
    lines.push(...alternative);
    for (const attachment of input.attachments ?? []) {
      lines.push(`--${boundaryMixed}`);
      lines.push(`Content-Type: ${attachment.contentType ?? 'application/octet-stream'}; name="${attachment.filename}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
      lines.push('');
      lines.push(base64Lines(attachment.content));
    }
    lines.push(`--${boundaryMixed}--`);
  } else {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
    lines.push('');
    lines.push(...alternative);
  }

  return lines.join('\r\n');
}
