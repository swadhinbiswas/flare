import { connect } from 'cloudflare:sockets';

/**
 * Tiny SMTP client on top of cloudflare:sockets. It covers EHLO, optional AUTH
 * (PLAIN with a LOGIN fallback), MAIL/RCPT/DATA with dot stuffing, and QUIT.
 *
 * `secure: 'tls'` connects with implicit TLS (port 465, what Resend and
 * Maileroo recommend) and `'none'` is plaintext for local relays. `'starttls'`
 * relies on the runtime performing the upgrade at connect time, which some
 * servers reject, so prefer 465 when you have the choice.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: 'tls' | 'starttls' | 'none';
  username?: string;
  password?: string;
  clientName?: string;
}

export interface SmtpEnvelope {
  from: string;
  to: string[];
}

const encoder = new TextEncoder();

export async function smtpSend(config: SmtpConfig, envelope: SmtpEnvelope, message: string): Promise<void> {
  if (!config.host) throw new Error('SMTP host is not configured');
  if (envelope.to.length === 0) throw new Error('SMTP needs at least one recipient');

  const secureTransport =
    config.secure === 'tls' ? ('on' as const) : config.secure === 'starttls' ? ('starttls' as const) : undefined;
  const socket = connect(`${config.host}:${config.port}`, {
    allowHalfOpen: false,
    ...(secureTransport ? { secureTransport } : {}),
  });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  async function readResponse(): Promise<string> {
    let collected = '';
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline === -1) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        continue;
      }
      const line = buffer.slice(0, newline + 1);
      buffer = buffer.slice(newline + 1);
      collected += line;
      if (/^\d{3} /.test(line)) return collected.replace(/\r?\n$/, '');
    }
    return collected.replace(/\r?\n$/, '');
  }

  async function command(text: string, expected: number[]): Promise<string> {
    await writer.write(encoder.encode(`${text}\r\n`));
    const response = await readResponse();
    const code = Number.parseInt(response.slice(0, 3), 10);
    if (!expected.includes(code)) {
      throw new Error(`SMTP ${text.split(' ')[0]} rejected: ${response.trim()}`);
    }
    return response;
  }

  try {
    const greeting = await readResponse();
    if (!greeting.startsWith('220')) throw new Error(`SMTP server refused the connection: ${greeting.trim()}`);

    const clientName = config.clientName ?? 'flare.local';
    let capabilities = await command(`EHLO ${clientName}`, [250]);

    if (config.username) {
      const authPlain = `AUTH PLAIN ${btoa(`\0${config.username}\0${config.password ?? ''}`)}`;
      if (/AUTH[ =-].*PLAIN/i.test(capabilities) || !/AUTH/i.test(capabilities)) {
        try {
          await command(authPlain, [235]);
        } catch {
          capabilities = await command(`EHLO ${clientName}`, [250]);
        }
      }
      if (/AUTH[ =-].*LOGIN/i.test(capabilities)) {
        await command('AUTH LOGIN', [334]);
        await command(btoa(config.username), [334]);
        await command(btoa(config.password ?? ''), [235]);
      }
    }

    await command(`MAIL FROM:<${envelope.from}>`, [250]);
    for (const recipient of envelope.to) {
      await command(`RCPT TO:<${recipient}>`, [250, 251]);
    }
    await command('DATA', [354]);

    const normalized = message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    await writer.write(encoder.encode(`${normalized}\r\n.\r\n`));
    const stored = await readResponse();
    if (!stored.startsWith('250')) throw new Error(`SMTP DATA rejected: ${stored.trim()}`);

    await command('QUIT', [221]).catch(() => undefined);
  } finally {
    try {
      await writer.close();
    } catch {
      // already closed
    }
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    try {
      socket.close();
    } catch {
      // ignore
    }
  }
}
