ALTER TABLE "devices"
  ADD COLUMN "upscale_mode" TEXT NOT NULL DEFAULT 'device',
  ADD COLUMN "buffer_profile" TEXT NOT NULL DEFAULT 'auto';
