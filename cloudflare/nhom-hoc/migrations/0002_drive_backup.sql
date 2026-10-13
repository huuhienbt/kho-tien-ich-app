CREATE TABLE IF NOT EXISTS nh_backup (
 id INTEGER PRIMARY KEY CHECK(id=1), backup_revision INTEGER NOT NULL DEFAULT -1,
 checksum TEXT NOT NULL DEFAULT '', last_success_at TEXT NOT NULL DEFAULT '',
 last_attempt_at TEXT NOT NULL DEFAULT '', last_checked_at TEXT NOT NULL DEFAULT '',
 error_code TEXT NOT NULL DEFAULT '', spreadsheet_id TEXT NOT NULL DEFAULT '',
 lease_token TEXT NOT NULL DEFAULT '', lease_until INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO nh_backup(id) VALUES(1);
