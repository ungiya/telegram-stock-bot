CREATE TABLE IF NOT EXISTS kind_runtime(id INTEGER PRIMARY KEY CHECK(id=1),lock_owner TEXT,lock_until_ms INTEGER NOT NULL DEFAULT 0,last_summary TEXT);
INSERT OR IGNORE INTO kind_runtime(id) VALUES(1);
CREATE TABLE IF NOT EXISTS kind_sources(source TEXT PRIMARY KEY,initialized_ms INTEGER,last_checked_ms INTEGER,last_count INTEGER,last_error TEXT);
CREATE TABLE IF NOT EXISTS kind_topics(ticker TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(ticker,source));
CREATE TABLE IF NOT EXISTS kind_items(event_key TEXT PRIMARY KEY,receipt TEXT,ticker TEXT,body TEXT NOT NULL,event_date TEXT NOT NULL,sent_ms INTEGER,created_ms INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS kind_pending ON kind_items(sent_ms,created_ms);
CREATE INDEX IF NOT EXISTS kind_receipt ON kind_items(receipt);
