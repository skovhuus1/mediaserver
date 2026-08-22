ALTER TABLE "live_tv_providers"
  ADD COLUMN "auto_refresh_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "playlist_refresh_minutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "epg_refresh_minutes" INTEGER NOT NULL DEFAULT 360,
  ADD COLUMN "last_playlist_queued_at" TIMESTAMP(3),
  ADD COLUMN "last_epg_queued_at" TIMESTAMP(3);

ALTER TABLE "live_tv_providers"
  ADD CONSTRAINT "live_tv_providers_playlist_refresh_minutes_check" CHECK ("playlist_refresh_minutes" BETWEEN 5 AND 1440),
  ADD CONSTRAINT "live_tv_providers_epg_refresh_minutes_check" CHECK ("epg_refresh_minutes" BETWEEN 15 AND 4320);

CREATE INDEX "live_tv_providers_account_id_enabled_auto_refresh_enabled_idx"
  ON "live_tv_providers"("account_id", "enabled", "auto_refresh_enabled");
