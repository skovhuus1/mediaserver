CREATE INDEX "media_items_account_id_type_series_metadata_provider_id_season_number_episode_number_idx"
ON "media_items"("account_id", "type", "series_metadata_provider_id", "season_number", "episode_number");

CREATE INDEX "media_items_account_id_type_series_display_title_season_number_episode_number_idx"
ON "media_items"("account_id", "type", "series_display_title", "season_number", "episode_number");
