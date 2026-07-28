ALTER TABLE "media_items"
  ADD COLUMN "overview" TEXT,
  ADD COLUMN "rating" DOUBLE PRECISION,
  ADD COLUMN "metadata_provider" TEXT,
  ADD COLUMN "metadata_provider_id" TEXT,
  ADD COLUMN "poster_path" TEXT,
  ADD COLUMN "backdrop_path" TEXT,
  ADD COLUMN "metadata_updated_at" TIMESTAMP(3);

CREATE INDEX "media_items_account_id_metadata_provider_metadata_provider_id_idx"
  ON "media_items"("account_id", "metadata_provider", "metadata_provider_id");
