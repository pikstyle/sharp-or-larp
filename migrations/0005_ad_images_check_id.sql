ALTER TABLE ad_images ADD COLUMN check_id TEXT;

CREATE INDEX ad_images_check_id ON ad_images (check_id);
