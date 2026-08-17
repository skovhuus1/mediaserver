ALTER TABLE "playback_sessions"
  ADD COLUMN "bandwidth_estimate" INTEGER,
  ADD COLUMN "dropped_frames" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_frames" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stall_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "playback_rate" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "audio_track" TEXT,
  ADD COLUMN "subtitle_track" TEXT,
  ADD COLUMN "last_state_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "playback_sessions"
  ADD CONSTRAINT "playback_sessions_frame_counts_nonnegative"
    CHECK ("dropped_frames" >= 0 AND "total_frames" >= 0 AND "stall_count" >= 0),
  ADD CONSTRAINT "playback_sessions_playback_rate_valid"
    CHECK ("playback_rate" >= 0.25 AND "playback_rate" <= 4);
