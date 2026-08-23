ALTER TABLE "live_tv_channel_sources"
  ADD COLUMN "quality_label" TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN "quality_rank" INTEGER NOT NULL DEFAULT 30;

UPDATE "live_tv_channel_sources"
SET
  "quality_label" = CASE
    WHEN lower("source_name") ~ '(^|[^a-z0-9])(4[[:space:]]*k|uhd|2160p?)([^a-z0-9]|$)' THEN 'uhd'
    WHEN lower("source_name") ~ '(^|[^a-z0-9])(full[[:space:]]*hd|fhd|fh|1080p?)([^a-z0-9]|$)' THEN 'fhd'
    WHEN lower("source_name") ~ '(^|[^a-z0-9])(hd|720p?)([^a-z0-9]|$)' THEN 'hd'
    WHEN lower("source_name") ~ '(^|[^a-z0-9])(sd|576p?|480p?)([^a-z0-9]|$)' THEN 'sd'
    ELSE 'standard'
  END,
  "quality_rank" = CASE
    WHEN lower("source_name") ~ '(^|[^a-z0-9])(4[[:space:]]*k|uhd|2160p?)([^a-z0-9]|$)' THEN 0
    WHEN lower("source_name") ~ '(^|[^a-z0-9])(full[[:space:]]*hd|fhd|fh|1080p?)([^a-z0-9]|$)' THEN 10
    WHEN lower("source_name") ~ '(^|[^a-z0-9])(hd|720p?)([^a-z0-9]|$)' THEN 20
    WHEN lower("source_name") ~ '(^|[^a-z0-9])(sd|576p?|480p?)([^a-z0-9]|$)' THEN 40
    ELSE 30
  END;

DROP INDEX IF EXISTS "live_tv_channel_sources_channel_id_enabled_priority_idx";
CREATE INDEX "live_tv_channel_sources_channel_id_enabled_quality_rank_priority_idx"
  ON "live_tv_channel_sources"("channel_id", "enabled", "quality_rank", "priority");
