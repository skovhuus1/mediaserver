ALTER TABLE "libraries"
  ADD COLUMN "auto_scan_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "scan_interval_minutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "last_scheduled_scan_at" TIMESTAMP(3);

ALTER TABLE "libraries"
  ADD CONSTRAINT "libraries_scan_interval_minutes_check"
  CHECK ("scan_interval_minutes" BETWEEN 5 AND 10080);

ALTER TABLE "media_items"
  ADD COLUMN "metadata_locked" BOOLEAN NOT NULL DEFAULT false;
