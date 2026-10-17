CREATE TABLE IF NOT EXISTS workspaces (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  mutation_token TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS study_items (
  user_id TEXT NOT NULL REFERENCES workspaces(user_id),
  collection TEXT NOT NULL,
  item_id TEXT NOT NULL,
  value TEXT NOT NULL CHECK(json_valid(value)),
  PRIMARY KEY (user_id, collection, item_id)
);
CREATE TABLE IF NOT EXISTS ai_leases (
  user_id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  quota_reserved INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ai_daily_usage (
  day TEXT NOT NULL,
  scope TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, scope)
);
