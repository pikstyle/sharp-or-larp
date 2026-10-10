CREATE TABLE vibes (
  fingerprint TEXT PRIMARY KEY,
  vibe TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX vibes_created_at ON vibes (created_at);
