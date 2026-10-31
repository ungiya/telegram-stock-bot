CREATE TABLE IF NOT EXISTS topic_state (
  ticker TEXT PRIMARY KEY,
  initialized_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS articles (
  url TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  title TEXT NOT NULL,
  pub_ms INTEGER NOT NULL,
  discovered_ms INTEGER NOT NULL,
  sent_ms INTEGER,
  lease_until_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_articles_unsent
  ON articles(sent_ms, lease_until_ms, pub_ms);
CREATE INDEX IF NOT EXISTS idx_articles_pub ON articles(pub_ms);
