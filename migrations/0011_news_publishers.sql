-- Distinct original articles first observed in Naver results, not per-poll hits.
-- The source URL can appear under multiple watchlist companies but counts once.
CREATE TABLE IF NOT EXISTS news_publisher_seen (
  url TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  first_seen_ms INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('eligible','blocked_source','content_filter','known_event'))
);
CREATE INDEX IF NOT EXISTS idx_news_publisher_seen_date
  ON news_publisher_seen(first_seen_ms, domain);
