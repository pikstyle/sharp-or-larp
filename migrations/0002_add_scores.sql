CREATE TABLE checks (
  id TEXT PRIMARY KEY,
  github_login TEXT,
  larp_percent INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

ALTER TABLE ads ADD COLUMN larp_percent INTEGER;
ALTER TABLE ads ADD COLUMN github_login TEXT;
