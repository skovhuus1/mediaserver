CREATE TABLE "live_tv_recordings" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "program_id" TEXT,
  "source_id" TEXT,
  "connection_id" TEXT,
  "title" TEXT NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "pre_padding_seconds" INTEGER NOT NULL DEFAULT 60,
  "post_padding_seconds" INTEGER NOT NULL DEFAULT 120,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "job_id" TEXT,
  "output_path" TEXT,
  "size_bytes" BIGINT,
  "duration_ms" INTEGER,
  "error" TEXT,
  "playback_token_hash" TEXT,
  "playback_token_expires_at" TIMESTAMP(3),
  "recording_started_at" TIMESTAMP(3),
  "recording_ended_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "live_tv_recordings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "live_tv_recordings_padding_check" CHECK ("pre_padding_seconds" BETWEEN 0 AND 600 AND "post_padding_seconds" BETWEEN 0 AND 1800),
  CONSTRAINT "live_tv_recordings_window_check" CHECK ("ends_at" > "starts_at")
);

CREATE UNIQUE INDEX "live_tv_recordings_playback_token_hash_key" ON "live_tv_recordings"("playback_token_hash");
CREATE UNIQUE INDEX "live_tv_recordings_profile_id_program_id_key" ON "live_tv_recordings"("profile_id", "program_id");
CREATE INDEX "live_tv_recordings_account_id_status_starts_at_idx" ON "live_tv_recordings"("account_id", "status", "starts_at");
CREATE INDEX "live_tv_recordings_connection_id_status_ends_at_idx" ON "live_tv_recordings"("connection_id", "status", "ends_at");
CREATE INDEX "live_tv_recordings_profile_id_created_at_idx" ON "live_tv_recordings"("profile_id", "created_at");

ALTER TABLE "live_tv_recordings" ADD CONSTRAINT "live_tv_recordings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_recordings" ADD CONSTRAINT "live_tv_recordings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_recordings" ADD CONSTRAINT "live_tv_recordings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_recordings" ADD CONSTRAINT "live_tv_recordings_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "live_tv_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "live_tv_recordings" ADD CONSTRAINT "live_tv_recordings_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "live_tv_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "live_tv_recordings" ADD CONSTRAINT "live_tv_recordings_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "live_tv_channel_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "live_tv_recordings" ADD CONSTRAINT "live_tv_recordings_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "live_tv_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
