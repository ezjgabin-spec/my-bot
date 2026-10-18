-- Password accounts are segregated from existing Cloudflare Access identities.
-- No existing workspaces, billing balances, or school data are migrated.
CREATE TABLE IF NOT EXISTS password_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS password_signups (
  email TEXT PRIMARY KEY,
  id TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS password_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES password_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS password_sessions_user_idx ON password_sessions(user_id);
CREATE INDEX IF NOT EXISTS password_sessions_expiry_idx ON password_sessions(expires_at);
CREATE TABLE IF NOT EXISTS password_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
