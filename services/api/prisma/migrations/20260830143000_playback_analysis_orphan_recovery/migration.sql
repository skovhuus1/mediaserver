CREATE INDEX "media_playback_assets_account_id_status_updated_at_idx"
  ON "media_playback_assets"("account_id", "status", "updated_at");

CREATE INDEX "system_jobs_account_id_type_status_idx"
  ON "system_jobs"("account_id", "type", "status");

CREATE INDEX "system_jobs_playback_media_active_idx"
  ON "system_jobs"("account_id", (("payload"->>'mediaId')))
  WHERE "type" = 'media.playback-assets'
    AND "status" IN ('queued', 'running', 'paused');
