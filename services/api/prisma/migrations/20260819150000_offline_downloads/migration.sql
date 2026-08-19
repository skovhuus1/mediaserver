CREATE TABLE "offline_downloads" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "device_id" TEXT NOT NULL,
  "media_id" TEXT NOT NULL,
  "quality_height" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "generation" TEXT NOT NULL,
  "output_path" TEXT,
  "size_bytes" BIGINT,
  "download_token_hash" TEXT NOT NULL,
  "download_token_expires_at" TIMESTAMP(3) NOT NULL,
  "license_expires_at" TIMESTAMP(3) NOT NULL,
  "error" TEXT,
  "job_id" TEXT,
  "ready_at" TIMESTAMP(3),
  "downloaded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "offline_downloads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offline_downloads_profile_id_device_id_media_id_key"
  ON "offline_downloads"("profile_id", "device_id", "media_id");
CREATE INDEX "offline_downloads_account_id_profile_id_device_id_status_idx"
  ON "offline_downloads"("account_id", "profile_id", "device_id", "status");
CREATE INDEX "offline_downloads_license_expires_at_idx"
  ON "offline_downloads"("license_expires_at");

ALTER TABLE "offline_downloads"
  ADD CONSTRAINT "offline_downloads_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offline_downloads"
  ADD CONSTRAINT "offline_downloads_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offline_downloads"
  ADD CONSTRAINT "offline_downloads_device_id_fkey"
  FOREIGN KEY ("device_id") REFERENCES "devices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offline_downloads"
  ADD CONSTRAINT "offline_downloads_media_id_fkey"
  FOREIGN KEY ("media_id") REFERENCES "media_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
