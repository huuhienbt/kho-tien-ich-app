CREATE TABLE IF NOT EXISTS collection_meta (
 id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0,
 initialized INTEGER NOT NULL DEFAULT 0, write_token TEXT NOT NULL DEFAULT '',
 backup_revision INTEGER NOT NULL DEFAULT 0, last_backup_at TEXT NOT NULL DEFAULT '',
 backup_error TEXT NOT NULL DEFAULT '', lease_token TEXT NOT NULL DEFAULT '', lease_until INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO collection_meta(id) VALUES(1);
CREATE TABLE IF NOT EXISTS prompts(id TEXT PRIMARY KEY,record TEXT NOT NULL CHECK(json_valid(record)),position INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS repairs(id TEXT PRIMARY KEY,record TEXT NOT NULL CHECK(json_valid(record)),position INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS prompts_order ON prompts(position);
CREATE INDEX IF NOT EXISTS repairs_order ON repairs(position);
CREATE TABLE IF NOT EXISTS favorites(user_id TEXT NOT NULL,prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,created_at TEXT NOT NULL,PRIMARY KEY(user_id,prompt_id));
CREATE TABLE IF NOT EXISTS collection_sessions(token_hash TEXT PRIMARY KEY,sub TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','member')),membership TEXT NOT NULL,expires_at INTEGER NOT NULL,epoch INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS collection_sessions_expiry ON collection_sessions(expires_at);
CREATE INDEX IF NOT EXISTS collection_sessions_user ON collection_sessions(sub);
CREATE TABLE IF NOT EXISTS user_epochs(sub TEXT PRIMARY KEY,epoch INTEGER NOT NULL DEFAULT 0);
