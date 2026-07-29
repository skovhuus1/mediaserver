ALTER TABLE "profiles"
ADD COLUMN "avatar_key" TEXT;

ALTER TABLE "devices"
ADD COLUMN "quality_mode" TEXT NOT NULL DEFAULT 'auto',
ADD COLUMN "fixed_quality_height" INTEGER,
ADD COLUMN "allow_upscale" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "data_saver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "playback_rate" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "hdr_mode" TEXT NOT NULL DEFAULT 'auto';

ALTER TABLE "media_items"
ADD COLUMN "genres" JSONB,
ADD COLUMN "credits" JSONB,
ADD COLUMN "similar_provider_ids" JSONB,
ADD COLUMN "recommendation_updated_at" TIMESTAMP(3);

CREATE TABLE "profile_preferences" (
  "profile_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "preferred_audio_languages" JSONB NOT NULL DEFAULT '["da","en"]'::jsonb,
  "preferred_subtitle_languages" JSONB NOT NULL DEFAULT '["da","en"]'::jsonb,
  "subtitle_mode" TEXT NOT NULL DEFAULT 'auto',
  "autoplay_next" BOOLEAN NOT NULL DEFAULT true,
  "recommendations_enabled" BOOLEAN NOT NULL DEFAULT true,
  "recommendation_reset_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "profile_preferences_pkey" PRIMARY KEY ("profile_id"),
  CONSTRAINT "profile_preferences_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "profile_preferences_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE
);

CREATE INDEX "profile_preferences_account_id_idx"
ON "profile_preferences"("account_id");

CREATE TABLE "recommendation_feedback" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "profile_id" TEXT NOT NULL,
  "media_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recommendation_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recommendation_feedback_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "recommendation_feedback_profile_id_fkey"
    FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "recommendation_feedback_media_id_fkey"
    FOREIGN KEY ("media_id") REFERENCES "media_items"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "recommendation_feedback_profile_id_media_id_key"
ON "recommendation_feedback"("profile_id", "media_id");

CREATE INDEX "recommendation_feedback_account_id_profile_id_type_idx"
ON "recommendation_feedback"("account_id", "profile_id", "type");

CREATE INDEX "media_items_genres_gin_idx" ON "media_items" USING GIN ("genres");
CREATE INDEX "media_items_credits_gin_idx" ON "media_items" USING GIN ("credits");
CREATE INDEX "media_items_similar_provider_ids_gin_idx" ON "media_items" USING GIN ("similar_provider_ids");
