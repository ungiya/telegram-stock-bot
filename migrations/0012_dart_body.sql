CREATE TABLE IF NOT EXISTS dart_body_delivery (
 receipt_no TEXT PRIMARY KEY,
 messages_json TEXT NOT NULL,
 next_part INTEGER NOT NULL DEFAULT 0
);
