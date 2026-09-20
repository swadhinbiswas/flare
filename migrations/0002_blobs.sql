-- Optional blob storage for attachment bytes. Used when BLOB_STORE=database
-- (the default), so the mailbox works without an R2 bucket.

CREATE TABLE IF NOT EXISTS blobs (
  key TEXT PRIMARY KEY,
  content BLOB NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
