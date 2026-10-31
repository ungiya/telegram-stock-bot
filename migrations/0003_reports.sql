CREATE TABLE IF NOT EXISTS report_sources (
  source TEXT PRIMARY KEY,
  initialized_ms INTEGER,
  checked_slot TEXT,
  retry_after_ms INTEGER NOT NULL DEFAULT 0,
  last_checked_ms INTEGER,
  last_count INTEGER,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS report_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  ticker TEXT,
  suppressed INTEGER NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  discovered_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_report_items_pending ON report_items(processed, ticker);
CREATE TABLE IF NOT EXISTS report_alerts (
  signature TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  created_ms INTEGER NOT NULL,
  sent_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_report_alerts_pending ON report_alerts(sent_ms, created_ms);
CREATE TABLE IF NOT EXISTS report_runtime (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  lock_owner TEXT,
  lock_until_ms INTEGER NOT NULL DEFAULT 0,
  last_checked_ms INTEGER,
  last_summary TEXT
);
INSERT OR IGNORE INTO report_runtime (id) VALUES (1);
