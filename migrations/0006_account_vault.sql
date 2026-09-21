-- Database-backed mail accounts. Secrets are stored encrypted (AES-GCM with a
-- key derived from SESSION_SECRET); provider keys are never written in clear.

CREATE TABLE IF NOT EXISTS mail_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,                   -- resend | maileroo | smtp
  label TEXT NOT NULL,
  from_email TEXT NOT NULL DEFAULT '',
  from_name TEXT,
  inbound_domain TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',   -- non-secret provider options
  secrets_enc TEXT,                         -- encrypted JSON of secret values
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
