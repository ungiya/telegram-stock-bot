CREATE TABLE IF NOT EXISTS news_delivery (
  url TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  pub_ms INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('attempting','sent','uncertain')),
  attempt_ms INTEGER NOT NULL,
  sent_ms INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS news_delivery_recent ON news_delivery(ticker,attempt_ms DESC);
CREATE TABLE IF NOT EXISTS news_send_lock (
  id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT, until_ms INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO news_send_lock(id) VALUES(1);
-- Preserve previously handled representatives when the normal article cache expires.
INSERT OR IGNORE INTO news_delivery(url,ticker,title,description,pub_ms,state,attempt_ms,sent_ms)
SELECT url,ticker,title,COALESCE(description,''),pub_ms,'sent',sent_ms,sent_ms
FROM articles WHERE sent_ms IS NOT NULL AND duplicate_of IS NULL;
ALTER TABLE bot_runtime ADD COLUMN last_duplicate_count INTEGER NOT NULL DEFAULT 0;
