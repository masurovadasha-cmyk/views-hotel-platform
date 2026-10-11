CREATE TABLE IF NOT EXISTS auth_attempts(
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_unix INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_email_time ON auth_attempts(email,created_unix);

CREATE TABLE IF NOT EXISTS email_login_tokens(
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_unix INTEGER NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email_login_tokens_email ON email_login_tokens(email,created_at);

CREATE TABLE IF NOT EXISTS app_sessions(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  guest_id TEXT,
  role TEXT,
  organization_id TEXT NOT NULL,
  property_ids TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_app_sessions_guest ON app_sessions(guest_id,expires_at);
