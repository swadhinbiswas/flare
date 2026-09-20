-- RFLARE initial schema (Turso / libSQL)
--
-- Design notes:
--   * Every inbound AND outbound message is a row in `messages`.
--   * `threads` groups messages by a normalized subject + participant key, or by
--     In-Reply-To / References headers when present.
--   * `email_events` is an append-only audit log (full status timeline);
--     `messages.status` holds the current computed state for fast list rendering.
--
-- Deviation from the build spec (deliberate, one column): `attachments.message_id`
-- is NULLABLE. Outbound attachments are uploaded to R2 before the message exists
-- (the compose flow returns an attachment id the client references in the send
-- payload), so the row is created with message_id = NULL and claimed by the send
-- handler once the message row is inserted.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,              -- uuid
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,      -- PBKDF2 hash, see src/lib/password.ts
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,              -- sha256(token); the raw token lives in the cookie
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,              -- uuid
  subject TEXT NOT NULL DEFAULT '',
  participants TEXT NOT NULL,       -- JSON array of email addresses involved
  last_message_at TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT 'inbox',   -- inbox | sent | archive | trash
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_threads_folder ON threads(folder, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,              -- uuid, our own id
  thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  resend_email_id TEXT,             -- id Resend gave this email (sent or received)
  direction TEXT NOT NULL,          -- 'inbound' | 'outbound'
  from_address TEXT NOT NULL,
  to_addresses TEXT NOT NULL,       -- JSON array
  cc_addresses TEXT NOT NULL DEFAULT '[]',
  bcc_addresses TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  text_body TEXT,
  html_body TEXT,
  message_id_header TEXT,           -- RFC Message-ID, for threading
  in_reply_to TEXT,                 -- RFC In-Reply-To header
  status TEXT NOT NULL DEFAULT 'queued',
  -- status values: queued | sent | delivered | delivery_delayed | bounced | complained | opened | clicked | received | failed
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_resend_id ON messages(resend_email_id);
CREATE INDEX IF NOT EXISTS idx_messages_message_id_header ON messages(message_id_header);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,              -- uuid
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE, -- NULL until an outbound message is sent
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER,
  r2_key TEXT NOT NULL,             -- where the blob lives in R2
  content_id TEXT,                  -- for inline images (cid:...)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);

CREATE TABLE IF NOT EXISTS email_events (
  id TEXT PRIMARY KEY,              -- uuid
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  resend_event_type TEXT NOT NULL,  -- email.sent, email.delivered, email.bounced, ...
  payload_json TEXT NOT NULL,       -- raw webhook payload, for debugging/audit
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_message ON email_events(message_id, created_at);
