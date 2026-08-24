ALTER TABLE "live_tv_leases"
  ADD COLUMN "available_tracks" JSONB NOT NULL DEFAULT '{"audio":[],"subtitles":[]}'::jsonb,
  ADD COLUMN "selected_audio_track_id" TEXT,
  ADD COLUMN "selected_subtitle_track_id" TEXT;

CREATE TABLE "system_metric_samples" (
  "id" UUID NOT NULL,
  "account_id" TEXT NOT NULL,
  "sampled_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cpu_percent" DOUBLE PRECISION NOT NULL,
  "memory_percent" DOUBLE PRECISION NOT NULL,
  "memory_used_bytes" BIGINT NOT NULL,
  "memory_total_bytes" BIGINT NOT NULL,
  "load_1m" DOUBLE PRECISION NOT NULL,
  "disk_used_percent" DOUBLE PRECISION NOT NULL,
  "disk_free_bytes" BIGINT NOT NULL,
  "active_sessions" INTEGER NOT NULL DEFAULT 0,
  "buffering_sessions" INTEGER NOT NULL DEFAULT 0,
  "queued_jobs" INTEGER NOT NULL DEFAULT 0,
  "failed_attempts_1h" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "system_metric_samples_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "system_metric_samples_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "system_metric_samples_account_sampled_idx"
  ON "system_metric_samples"("account_id", "sampled_at" DESC);

CREATE TABLE "system_alert_events" (
  "id" UUID NOT NULL,
  "account_id" TEXT NOT NULL,
  "alert_key" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMPTZ,
  "acknowledged_by" TEXT,
  "resolved_at" TIMESTAMPTZ,
  CONSTRAINT "system_alert_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "system_alert_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "system_alert_events_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "system_alert_events_severity_check" CHECK ("severity" IN ('warning', 'error')),
  CONSTRAINT "system_alert_events_status_check" CHECK ("status" IN ('open', 'acknowledged', 'resolved'))
);

CREATE INDEX "system_alert_events_account_status_idx"
  ON "system_alert_events"("account_id", "status", "last_seen_at" DESC);

CREATE UNIQUE INDEX "system_alert_events_open_key_unique"
  ON "system_alert_events"("account_id", "alert_key")
  WHERE "status" IN ('open', 'acknowledged');
