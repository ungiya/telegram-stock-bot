CREATE TABLE IF NOT EXISTS watchlist_overrides (
  ticker TEXT PRIMARY KEY,
  aliases_json TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0, 1))
);
CREATE TABLE IF NOT EXISTS bot_runtime (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  next_update_id INTEGER,
  paused INTEGER NOT NULL DEFAULT 0,
  lock_owner TEXT,
  lock_until_ms INTEGER NOT NULL DEFAULT 0,
  last_checked_ms INTEGER,
  last_checked_count INTEGER,
  last_sent_count INTEGER
);
INSERT OR IGNORE INTO bot_runtime (id) VALUES (1);
