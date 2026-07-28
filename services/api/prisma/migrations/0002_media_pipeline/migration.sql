-- CreateEnum
CREATE TYPE "MediaFileStatus" AS ENUM ('ready', 'unreadable', 'missing');

-- CreateEnum
CREATE TYPE "LibraryScanStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "media_files" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "library_id" TEXT NOT NULL,
    "storage_root_id" TEXT NOT NULL,
    "media_item_id" TEXT NOT NULL,
    "relative_path" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "modified_at" TIMESTAMP(3) NOT NULL,
    "status" "MediaFileStatus" NOT NULL DEFAULT 'ready',
    "container" TEXT,
    "video_codec" TEXT,
    "audio_codec" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_ms" INTEGER,
    "bitrate" INTEGER,
    "probe" JSONB,
    "last_seen_scan_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_scans" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "library_id" TEXT NOT NULL,
    "job_id" TEXT,
    "status" "LibraryScanStatus" NOT NULL DEFAULT 'queued',
    "files_seen" INTEGER NOT NULL DEFAULT 0,
    "files_created" INTEGER NOT NULL DEFAULT 0,
    "files_updated" INTEGER NOT NULL DEFAULT 0,
    "files_missing" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_files_media_item_id_key" ON "media_files"("media_item_id");

-- CreateIndex
CREATE INDEX "media_files_library_id_status_idx" ON "media_files"("library_id", "status");

-- CreateIndex
CREATE INDEX "media_files_last_seen_scan_id_idx" ON "media_files"("last_seen_scan_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_files_library_id_relative_path_key" ON "media_files"("library_id", "relative_path");

-- CreateIndex
CREATE UNIQUE INDEX "library_scans_job_id_key" ON "library_scans"("job_id");

-- CreateIndex
CREATE INDEX "library_scans_library_id_created_at_idx" ON "library_scans"("library_id", "created_at");

-- CreateIndex
CREATE INDEX "library_scans_account_id_status_idx" ON "library_scans"("account_id", "status");

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_storage_root_id_fkey" FOREIGN KEY ("storage_root_id") REFERENCES "storage_roots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_files" ADD CONSTRAINT "media_files_media_item_id_fkey" FOREIGN KEY ("media_item_id") REFERENCES "media_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_scans" ADD CONSTRAINT "library_scans_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_scans" ADD CONSTRAINT "library_scans_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
