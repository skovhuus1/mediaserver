ALTER TABLE "playback_history"
  DROP CONSTRAINT IF EXISTS "playback_history_playback_session_id_fkey";

ALTER TABLE "playback_history"
  ALTER COLUMN "playback_session_id" DROP NOT NULL;

ALTER TABLE "playback_history"
  ADD CONSTRAINT "playback_history_playback_session_id_fkey"
  FOREIGN KEY ("playback_session_id") REFERENCES "playback_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "watchlist_entries" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "media_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "watchlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "watchlist_entries_profile_id_media_id_key"
  ON "watchlist_entries"("profile_id", "media_id");
CREATE INDEX "watchlist_entries_account_id_profile_id_created_at_idx"
  ON "watchlist_entries"("account_id", "profile_id", "created_at");

ALTER TABLE "watchlist_entries"
  ADD CONSTRAINT "watchlist_entries_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watchlist_entries"
  ADD CONSTRAINT "watchlist_entries_profile_id_fkey"
  FOREIGN KEY ("profile_id") REFERENCES "profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watchlist_entries"
  ADD CONSTRAINT "watchlist_entries_media_id_fkey"
  FOREIGN KEY ("media_id") REFERENCES "media_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
