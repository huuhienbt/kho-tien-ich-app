CREATE TABLE IF NOT EXISTS admin_credentials (
 id INTEGER PRIMARY KEY CHECK(id=1),
 password_hash TEXT NOT NULL, salt TEXT NOT NULL,
 iterations INTEGER NOT NULL CHECK(iterations=100000),
 key_id TEXT NOT NULL, created_at TEXT NOT NULL,
 legacy_login_disabled INTEGER NOT NULL DEFAULT 0 CHECK(legacy_login_disabled IN (0,1))
);
CREATE TABLE IF NOT EXISTS admin_login_attempts (
 bucket INTEGER PRIMARY KEY, attempts INTEGER NOT NULL
);
