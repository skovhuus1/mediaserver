CREATE TABLE "metadata_overrides" (
  "id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "library_id" TEXT NOT NULL,
  "series_key" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "season_number" INTEGER NOT NULL,
  "episode_number" INTEGER,
  "title" TEXT,
  "overview" TEXT,
  "release_date" TIMESTAMP(3),
  "image_path" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "metadata_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metadata_overrides_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "metadata_overrides_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "metadata_overrides_account_id_library_id_series_key_scope_key_key"
ON "metadata_overrides"("account_id", "library_id", "series_key", "scope_key");

CREATE INDEX "metadata_overrides_account_id_library_id_series_key_idx"
ON "metadata_overrides"("account_id", "library_id", "series_key");
