ALTER TABLE articles ADD COLUMN duplicate_of TEXT;
CREATE INDEX IF NOT EXISTS articles_recent_handled ON articles(pub_ms) WHERE sent_ms IS NOT NULL AND duplicate_of IS NULL;
