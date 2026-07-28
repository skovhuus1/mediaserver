ALTER TABLE "media_items"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "series_title" TEXT,
  ADD COLUMN "season_number" INTEGER,
  ADD COLUMN "episode_number" INTEGER,
  ADD COLUMN "release_year" INTEGER;

CREATE INDEX "media_items_account_id_category_idx"
  ON "media_items"("account_id", "category");

CREATE INDEX "media_items_account_id_series_title_season_number_idx"
  ON "media_items"("account_id", "series_title", "season_number");
