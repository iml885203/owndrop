-- OwnDrop initial schema (shared between Cloudflare D1 and local SQLite)

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('text', 'image', 'file')),
  text TEXT,
  name TEXT,
  mime TEXT,
  size INTEGER NOT NULL,
  storage_key TEXT,
  device TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
  preview_status TEXT,
  link_title TEXT,
  link_description TEXT,
  link_image TEXT,
  link_site_name TEXT,
  link_favicon TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_order
  ON items (pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_items_created_at
  ON items (created_at ASC);

CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  subject TEXT NOT NULL DEFAULT 'owner',
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires
  ON sessions (expires_at ASC);

CREATE TABLE IF NOT EXISTS oidc_transactions (
  state TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  browser_binding_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_uploads (
  id TEXT PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  expected_size INTEGER NOT NULL,
  device TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL
);
