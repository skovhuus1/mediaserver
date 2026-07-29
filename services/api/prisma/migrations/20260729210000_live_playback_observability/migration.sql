ALTER TABLE "playback_sessions"
  ADD COLUMN "runtime_state" TEXT NOT NULL DEFAULT 'starting',
  ADD COLUMN "position_ms" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "duration_ms" INTEGER,
  ADD COLUMN "current_bitrate" INTEGER,
  ADD COLUMN "current_height" INTEGER,
  ADD COLUMN "buffer_ahead_ms" INTEGER;
