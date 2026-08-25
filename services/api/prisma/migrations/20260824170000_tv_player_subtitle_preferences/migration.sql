ALTER TABLE "profile_preferences"
  ADD COLUMN "subtitle_style" TEXT NOT NULL DEFAULT 'broadcast',
  ADD COLUMN "subtitle_text_color" TEXT NOT NULL DEFAULT '#FFFFFF',
  ADD COLUMN "subtitle_size_percent" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "subtitle_bottom_offset_percent" INTEGER NOT NULL DEFAULT 6,
  ADD COLUMN "subtitle_timing_offset_ms" INTEGER NOT NULL DEFAULT 0;
