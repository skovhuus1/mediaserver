ALTER TABLE "media_items"
  ADD COLUMN "series_display_title" TEXT,
  ADD COLUMN "series_overview" TEXT,
  ADD COLUMN "series_metadata_provider_id" TEXT,
  ADD COLUMN "season_metadata_provider_id" TEXT,
  ADD COLUMN "season_poster_path" TEXT,
  ADD COLUMN "episode_still_path" TEXT;

CREATE INDEX "media_items_account_id_series_metadata_provider_id_idx"
  ON "media_items"("account_id", "series_metadata_provider_id");
