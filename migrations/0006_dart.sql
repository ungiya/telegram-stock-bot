CREATE TABLE IF NOT EXISTS dart_runtime (
 id INTEGER PRIMARY KEY CHECK (id = 1),
 next_page INTEGER NOT NULL DEFAULT 1,
 lock_owner TEXT,
 lock_until_ms INTEGER NOT NULL DEFAULT 0,
 last_summary TEXT,
 last_checked_ms INTEGER
);
INSERT OR IGNORE INTO dart_runtime(id) VALUES(1);
CREATE TABLE IF NOT EXISTS dart_topics (
 ticker TEXT PRIMARY KEY,
 initialized_at INTEGER
);
CREATE TABLE IF NOT EXISTS dart_filings (
 receipt_no TEXT PRIMARY KEY,
 ticker TEXT NOT NULL,
 company_name TEXT NOT NULL,
 report_name TEXT NOT NULL,
 filed_date TEXT NOT NULL,
 discovered_ms INTEGER NOT NULL,
 sent_ms INTEGER
);
CREATE INDEX IF NOT EXISTS dart_pending ON dart_filings(sent_ms, receipt_no);
