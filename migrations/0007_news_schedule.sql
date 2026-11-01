CREATE TABLE IF NOT EXISTS news_schedule (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  last_attempt_ms INTEGER
);
INSERT OR IGNORE INTO news_schedule(id, last_attempt_ms)
SELECT 1, last_checked_ms FROM bot_runtime WHERE id = 1;
