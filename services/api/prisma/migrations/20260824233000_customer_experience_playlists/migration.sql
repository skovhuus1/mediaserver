ALTER TABLE "watchlist_entries"
  ADD COLUMN "target_type" TEXT NOT NULL DEFAULT 'media',
  ADD COLUMN "target_key" TEXT;

UPDATE "watchlist_entries" AS entry
SET
  "target_type" = CASE WHEN media."type" = 'episode' THEN 'series' ELSE 'media' END,
  "target_key" = CASE
    WHEN media."type" = 'episode' AND media."series_metadata_provider_id" IS NOT NULL
      THEN 'series:' || media."series_metadata_provider_id"
    WHEN media."type" = 'episode'
      THEN 'series-name:' || lower(regexp_replace(trim(coalesce(media."series_display_title", media."series_title", media."title")), '\s+', ' ', 'g'))
    ELSE 'media:' || entry."media_id"
  END
FROM "media_items" AS media
WHERE media."id" = entry."media_id";

UPDATE "watchlist_entries"
SET "target_key" = 'media:' || "media_id"
WHERE "target_key" IS NULL;

DELETE FROM "watchlist_entries" AS duplicate
USING "watchlist_entries" AS keeper
WHERE duplicate."profile_id" = keeper."profile_id"
  AND duplicate."target_key" = keeper."target_key"
  AND (duplicate."created_at", duplicate."id") < (keeper."created_at", keeper."id");

ALTER TABLE "watchlist_entries" ALTER COLUMN "target_key" SET NOT NULL;
DROP INDEX IF EXISTS "watchlist_entries_profile_id_media_id_key";
CREATE UNIQUE INDEX "watchlist_entries_profile_id_target_key_key"
  ON "watchlist_entries"("profile_id", "target_key");

ALTER TABLE "profile_preferences"
  ALTER COLUMN "home_row_order" SET DEFAULT '["recommendations","continue","watchlist","latest_episodes","new_movies","new_series","genres","popular"]';

CREATE TABLE "playlists" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "playlist_items" (
  "id" TEXT NOT NULL,
  "playlist_id" TEXT NOT NULL,
  "media_id" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_key" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "playlist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "playlists_account_id_profile_id_updated_at_idx" ON "playlists"("account_id", "profile_id", "updated_at");
CREATE UNIQUE INDEX "playlist_items_playlist_id_target_key_key" ON "playlist_items"("playlist_id", "target_key");
CREATE INDEX "playlist_items_playlist_id_position_idx" ON "playlist_items"("playlist_id", "position");
CREATE INDEX "playlist_items_media_id_idx" ON "playlist_items"("media_id");

ALTER TABLE "playlists" ADD CONSTRAINT "playlists_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
