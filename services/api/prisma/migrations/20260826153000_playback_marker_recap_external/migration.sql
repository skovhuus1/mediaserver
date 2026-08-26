ALTER TABLE "media_timeline_markers"
  DROP CONSTRAINT IF EXISTS "media_timeline_markers_kind_check";

ALTER TABLE "media_timeline_markers"
  ADD CONSTRAINT "media_timeline_markers_kind_check"
  CHECK ("kind" IN ('intro', 'recap', 'credits'));

ALTER TABLE "media_timeline_markers"
  DROP CONSTRAINT IF EXISTS "media_timeline_markers_source_check";

ALTER TABLE "media_timeline_markers"
  ADD CONSTRAINT "media_timeline_markers_source_check"
  CHECK ("source" IN ('chapter', 'automatic', 'external', 'manual'));
