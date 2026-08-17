CREATE TABLE "media_playback_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "media_id" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "sprite_directory" TEXT,
  "manifest" JSONB,
  "fingerprint" JSONB,
  "interval_seconds" INTEGER NOT NULL DEFAULT 10,
  "tile_width" INTEGER NOT NULL DEFAULT 320,
  "tile_height" INTEGER NOT NULL DEFAULT 180,
  "columns" INTEGER NOT NULL DEFAULT 5,
  "rows" INTEGER NOT NULL DEFAULT 5,
  "frame_count" INTEGER NOT NULL DEFAULT 0,
  "sheet_count" INTEGER NOT NULL DEFAULT 0,
  "duration_ms" INTEGER,
  "source_modified_at" TIMESTAMP(3),
  "generated_at" TIMESTAMP(3),
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "media_playback_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "media_timeline_markers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "media_id" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "start_ms" INTEGER NOT NULL,
  "end_ms" INTEGER NOT NULL,
  "source" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "media_timeline_markers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_timeline_markers_range_check" CHECK ("start_ms" >= 0 AND "end_ms" > "start_ms"),
  CONSTRAINT "media_timeline_markers_kind_check" CHECK ("kind" IN ('intro', 'credits')),
  CONSTRAINT "media_timeline_markers_source_check" CHECK ("source" IN ('chapter', 'automatic', 'manual'))
);

CREATE UNIQUE INDEX "media_playback_assets_media_id_key" ON "media_playback_assets"("media_id");
CREATE INDEX "media_playback_assets_account_id_status_idx" ON "media_playback_assets"("account_id", "status");
CREATE UNIQUE INDEX "media_timeline_markers_media_id_kind_key" ON "media_timeline_markers"("media_id", "kind");
CREATE INDEX "media_timeline_markers_account_id_media_id_idx" ON "media_timeline_markers"("account_id", "media_id");
ALTER TABLE "media_playback_assets" ADD CONSTRAINT "media_playback_assets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_playback_assets" ADD CONSTRAINT "media_playback_assets_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_timeline_markers" ADD CONSTRAINT "media_timeline_markers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media_timeline_markers" ADD CONSTRAINT "media_timeline_markers_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
