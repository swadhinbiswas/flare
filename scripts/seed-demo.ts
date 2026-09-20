/**
 * Seeds a demo mailbox: a handful of realistic threads, attachments metadata
 * and delivery events. Development only.
 *
 *   pnpm seed-demo            # local / self-hosted databases
 *   pnpm seed-demo --force    # allow seeding a remote turso.io database
 *
 * The guard refuses remote databases unless --force is passed, because this
 * writes fictional mail into whatever TURSO_DATABASE_URL points at.
 */
import { createDb } from '../src/lib/db-client';
import { loadEnv } from './_shared';

const env = loadEnv();
const url = env.TURSO_DATABASE_URL ?? '';
const force = process.argv.includes('--force');

if (!url) {
  console.error('TURSO_DATABASE_URL is not set (check .env or .dev.vars).');
  process.exit(1);
}
if (url.includes('turso.io') && !force) {
  console.error(`Refusing to seed the remote database ${url}.`);
  console.error('Pass --force if you really want fictional threads in there.');
  process.exit(1);
}

const db = createDb(url, env.TURSO_AUTH_TOKEN ?? '');
const now = Date.now();
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

const inlineChart =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="90" viewBox="0 0 320 90"><rect width="320" height="90" rx="10" fill="#eef2ff"/><g fill="#4f6bed"><rect x="24" y="46" width="26" height="30" rx="4"/><rect x="62" y="34" width="26" height="42" rx="4"/><rect x="100" y="22" width="26" height="54" rx="4"/><rect x="138" y="40" width="26" height="36" rx="4"/><rect x="176" y="14" width="26" height="62" rx="4"/><rect x="214" y="30" width="26" height="46" rx="4"/><rect x="252" y="8" width="26" height="68" rx="4"/></g></svg>`,
  );

interface ThreadSeed {
  id: string;
  subject: string;
  participants: string[];
  folder: string;
  unread: number;
  lastAt: string;
  messages: {
    id: string;
    resendId: string | null;
    direction: 'inbound' | 'outbound';
    from: string;
    to: string[];
    subject: string;
    text?: string;
    html?: string;
    messageId?: string;
    inReplyTo?: string;
    status: string;
    isRead: number;
    at: string;
  }[];
  events: { messageId: string; type: string; at: string }[];
}

const seed: ThreadSeed[] = [
  {
    id: crypto.randomUUID(),
    subject: 'Design review notes',
    participants: ['Priya Raman <priya@example.com>', 'admin@mail.example.com'],
    folder: 'inbox',
    unread: 1,
    lastAt: iso(14),
    messages: [
      {
        id: crypto.randomUUID(),
        resendId: 'demo-in-1',
        direction: 'inbound',
        from: 'Priya Raman <priya@example.com>',
        to: ['admin@mail.example.com'],
        subject: 'Design review notes',
        text: 'Hi! Notes from the review are below. The funnel numbers look much better this week.',
        html: `<p>Hi! Notes from the review are below. The funnel numbers look much better this week.</p><p><img src="${inlineChart}" alt="weekly funnel" width="320" /></p><p>Cheers,<br/>Priya</p>`,
        messageId: '<demo-in-1@example.com>',
        status: 'received',
        isRead: 0,
        at: iso(40),
      },
      {
        id: crypto.randomUUID(),
        resendId: 'demo-out-1',
        direction: 'outbound',
        from: 'RFLARE <admin@mail.example.com>',
        to: ['Priya Raman <priya@example.com>'],
        subject: 'Re: Design review notes',
        text: 'Thanks Priya. The chart makes it obvious where we lost people. I will reply properly after standup.',
        messageId: '<demo-out-1@mail.example.com>',
        inReplyTo: '<demo-in-1@example.com>',
        status: 'opened',
        isRead: 1,
        at: iso(14),
      },
    ],
    events: [
      { messageId: 'demo-in-1', type: 'email.received', at: iso(40) },
      { messageId: 'demo-out-1', type: 'email.sent', at: iso(14) },
      { messageId: 'demo-out-1', type: 'email.delivered', at: iso(13) },
      { messageId: 'demo-out-1', type: 'email.opened', at: iso(6) },
    ],
  },
  {
    id: crypto.randomUUID(),
    subject: 'Invoice #0042 from Acme',
    participants: ['Acme Billing <billing@acme.example>', 'admin@mail.example.com'],
    folder: 'inbox',
    unread: 0,
    lastAt: iso(95),
    messages: [
      {
        id: crypto.randomUUID(),
        resendId: 'demo-in-2',
        direction: 'inbound',
        from: 'Acme Billing <billing@acme.example>',
        to: ['admin@mail.example.com'],
        subject: 'Invoice #0042 from Acme',
        text: 'Your invoice for September is attached. It will be charged to the card on file on the 28th.',
        messageId: '<demo-in-2@acme.example>',
        status: 'received',
        isRead: 1,
        at: iso(95),
      },
    ],
    events: [{ messageId: 'demo-in-2', type: 'email.received', at: iso(95) }],
  },
  {
    id: crypto.randomUUID(),
    subject: '[rflare] Deploy succeeded on main',
    participants: ['GitHub <notifications@github.com>', 'admin@mail.example.com'],
    folder: 'inbox',
    unread: 1,
    lastAt: iso(180),
    messages: [
      {
        id: crypto.randomUUID(),
        resendId: 'demo-in-3',
        direction: 'inbound',
        from: 'GitHub <notifications@github.com>',
        to: ['admin@mail.example.com'],
        subject: '[rflare] Deploy succeeded on main',
        text: 'Workflow run #128 finished in 1m 46s. View the run for details.',
        messageId: '<demo-in-3@github.com>',
        status: 'received',
        isRead: 0,
        at: iso(180),
      },
    ],
    events: [{ messageId: 'demo-in-3', type: 'email.received', at: iso(180) }],
  },
  {
    id: crypto.randomUUID(),
    subject: 'Call me when you get a minute',
    participants: ['Mum <mum@example.com>', 'admin@mail.example.com'],
    folder: 'inbox',
    unread: 0,
    lastAt: iso(60 * 26),
    messages: [
      {
        id: crypto.randomUUID(),
        resendId: 'demo-in-4',
        direction: 'inbound',
        from: 'Mum <mum@example.com>',
        to: ['admin@mail.example.com'],
        subject: 'Call me when you get a minute',
        text: 'Nothing urgent. Just wanted to hear how the new place is coming along.',
        messageId: '<demo-in-4@example.com>',
        status: 'received',
        isRead: 1,
        at: iso(60 * 26),
      },
    ],
    events: [{ messageId: 'demo-in-4', type: 'email.received', at: iso(60 * 26) }],
  },
  {
    id: crypto.randomUUID(),
    subject: 'RFLARE send test',
    participants: ['friend@example.com', 'admin@mail.example.com'],
    folder: 'sent',
    unread: 0,
    lastAt: iso(300),
    messages: [
      {
        id: crypto.randomUUID(),
        resendId: 'demo-out-2',
        direction: 'outbound',
        from: 'RFLARE <admin@mail.example.com>',
        to: ['friend@example.com'],
        subject: 'RFLARE send test',
        text: 'If you are reading this in your inbox, sending works end to end.',
        messageId: '<demo-out-2@mail.example.com>',
        status: 'clicked',
        isRead: 1,
        at: iso(300),
      },
    ],
    events: [
      { messageId: 'demo-out-2', type: 'email.sent', at: iso(300) },
      { messageId: 'demo-out-2', type: 'email.delivered', at: iso(299) },
      { messageId: 'demo-out-2', type: 'email.opened', at: iso(240) },
      { messageId: 'demo-out-2', type: 'email.clicked', at: iso(238) },
    ],
  },
  {
    id: crypto.randomUUID(),
    subject: 'Q3 planning doc',
    participants: ['Sam Lee <sam@example.com>', 'admin@mail.example.com'],
    folder: 'archive',
    unread: 0,
    lastAt: iso(60 * 72),
    messages: [
      {
        id: crypto.randomUUID(),
        resendId: 'demo-in-5',
        direction: 'inbound',
        from: 'Sam Lee <sam@example.com>',
        to: ['admin@mail.example.com'],
        subject: 'Q3 planning doc',
        text: 'Dropping the doc here so it does not get lost in chat.',
        messageId: '<demo-in-5@example.com>',
        status: 'received',
        isRead: 1,
        at: iso(60 * 72),
      },
    ],
    events: [{ messageId: 'demo-in-5', type: 'email.received', at: iso(60 * 72) }],
  },
];

for (const thread of seed) {
  await db.execute({
    sql: `INSERT INTO threads (id, subject, participants, last_message_at, folder, unread_count, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [thread.id, thread.subject, JSON.stringify(thread.participants), thread.lastAt, thread.folder, thread.unread, thread.lastAt],
  });
}

const messageIdMap = new Map<string, string>();
for (const thread of seed) {
  for (const message of thread.messages) {
    const newId = crypto.randomUUID();
    messageIdMap.set(message.resendId ?? newId, newId);
    await db.execute({
      sql: `INSERT INTO messages (id, thread_id, resend_email_id, direction, from_address, to_addresses, cc_addresses, bcc_addresses, subject, text_body, html_body, message_id_header, in_reply_to, status, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        newId,
        thread.id,
        message.resendId,
        message.direction,
        message.from,
        JSON.stringify(message.to),
        message.subject,
        message.text ?? null,
        message.html ?? null,
        message.messageId ?? null,
        message.inReplyTo ?? null,
        message.status,
        message.isRead,
        message.at,
      ],
    });
  }
  for (const event of thread.events) {
    await db.execute({
      sql: `INSERT INTO email_events (id, message_id, resend_event_type, payload_json, created_at) VALUES (?, ?, ?, '{}', ?)`,
      args: [crypto.randomUUID(), messageIdMap.get(event.messageId) ?? event.messageId, event.type, event.at],
    });
  }
}

const counts = await db.execute('SELECT folder, COUNT(*) AS n FROM threads GROUP BY folder');
console.log('Seeded demo mailbox:', JSON.stringify(counts.rows));
console.log('Remember: this is fictional data. Delete the threads from the UI when you are done.');
