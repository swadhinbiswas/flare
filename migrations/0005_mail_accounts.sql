-- Every thread and message belongs to a mail account. Existing rows belong to
-- the primary account, which is the one synthesised from the RESEND_* / MAIL_*
-- environment when MAIL_ACCOUNTS is empty.

ALTER TABLE threads ADD COLUMN account_id TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE messages ADD COLUMN account_id TEXT NOT NULL DEFAULT 'primary';

CREATE INDEX IF NOT EXISTS idx_threads_account ON threads(account_id, folder, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_account ON messages(account_id, created_at);
