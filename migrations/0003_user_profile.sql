-- Profile fields for the mailbox owner. The display name is used in the From
-- header; the avatar is stored in the blob store and served through the app.

ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN avatar_key TEXT;
ALTER TABLE users ADD COLUMN avatar_content_type TEXT;
