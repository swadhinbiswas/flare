-- Avatar can be an uploaded blob or an external image URL.
ALTER TABLE users ADD COLUMN avatar_url TEXT;
