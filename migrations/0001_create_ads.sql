CREATE TABLE ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_session_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  headline TEXT NOT NULL,
  linkedin_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX ads_expires_at ON ads (expires_at);
