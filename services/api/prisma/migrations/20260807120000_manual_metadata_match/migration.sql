CREATE TABLE "metadata_bindings" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "library_id" TEXT NOT NULL,
  "media_type" TEXT NOT NULL,
  "local_key" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "provider_title" TEXT NOT NULL,
  "locked" BOOLEAN NOT NULL DEFAULT true,
  "matched_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "metadata_bindings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "metadata_bindings_account_id_library_id_media_type_local_key_key"
  ON "metadata_bindings"("account_id", "library_id", "media_type", "local_key");
CREATE INDEX "metadata_bindings_account_id_provider_provider_id_idx"
  ON "metadata_bindings"("account_id", "provider", "provider_id");

ALTER TABLE "metadata_bindings"
  ADD CONSTRAINT "metadata_bindings_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "metadata_bindings"
  ADD CONSTRAINT "metadata_bindings_library_id_fkey"
  FOREIGN KEY ("library_id") REFERENCES "libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
