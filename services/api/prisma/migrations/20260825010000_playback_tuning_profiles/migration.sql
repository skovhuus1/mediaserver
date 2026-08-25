ALTER TABLE "devices"
ADD COLUMN "upscale_mode" TEXT NOT NULL DEFAULT 'device',
ADD COLUMN "buffer_profile" TEXT NOT NULL DEFAULT 'auto';

UPDATE "devices"
SET "upscale_mode" = CASE
  WHEN "allow_upscale" = false THEN 'off'
  ELSE 'device'
END;
