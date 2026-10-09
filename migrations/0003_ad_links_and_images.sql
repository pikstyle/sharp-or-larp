ALTER TABLE ads RENAME COLUMN linkedin_url TO link_url;
ALTER TABLE ads ADD COLUMN image_id TEXT;

CREATE TABLE ad_images (
  id TEXT PRIMARY KEY,
  jpeg_base64 TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
