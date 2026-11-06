-- Shared atomic sent-claim across KIND and DART for the same earnings disclosure.
-- A claimed but unsent row can be recovered after timeout. Corrected reports
-- are deliberately excluded from the cross-source earnings fingerprint.
CREATE TABLE IF NOT EXISTS disclosure_deliveries (
  event_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  receipt TEXT NOT NULL,
  claimed_ms INTEGER NOT NULL,
  delivered_ms INTEGER
);
CREATE INDEX IF NOT EXISTS disclosure_delivery_recovery ON disclosure_deliveries(delivered_ms,claimed_ms);
