CREATE TABLE "live_tv_providers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "account_id" UUID NOT NULL, "name" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "priority" INTEGER NOT NULL DEFAULT 100,
  "per_user_stream_limit" INTEGER NOT NULL DEFAULT 1, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "live_tv_providers_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "live_tv_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "account_id" UUID NOT NULL, "provider_id" UUID NOT NULL,
  "name" TEXT NOT NULL, "playlist_url" JSONB NOT NULL, "playlist_fingerprint" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "priority" INTEGER NOT NULL DEFAULT 100,
  "max_concurrent_streams" INTEGER NOT NULL DEFAULT 1, "health_status" TEXT NOT NULL DEFAULT 'unknown',
  "last_error" TEXT, "last_imported_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "live_tv_connections_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "live_tv_channels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "account_id" UUID NOT NULL, "canonical_key" TEXT NOT NULL,
  "tvg_id" TEXT, "name" TEXT NOT NULL, "number" INTEGER, "logo_url" TEXT, "group_name" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "is_adult" BOOLEAN NOT NULL DEFAULT false,
  "metadata_locked" BOOLEAN NOT NULL DEFAULT false, "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "live_tv_channels_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "live_tv_channel_sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "channel_id" UUID NOT NULL, "connection_id" UUID NOT NULL,
  "external_id" TEXT, "source_name" TEXT NOT NULL, "encrypted_stream_url" JSONB NOT NULL,
  "stream_fingerprint" TEXT NOT NULL, "stream_format" TEXT NOT NULL DEFAULT 'auto', "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true, "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "live_tv_channel_sources_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "live_tv_epg_sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "account_id" UUID NOT NULL, "provider_id" UUID NOT NULL,
  "encrypted_url" JSONB NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "health_status" TEXT NOT NULL DEFAULT 'unknown',
  "last_error" TEXT, "last_imported_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "live_tv_epg_sources_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "live_tv_programs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "account_id" UUID NOT NULL, "provider_id" UUID NOT NULL,
  "channel_id" UUID NOT NULL, "starts_at" TIMESTAMP(3) NOT NULL, "ends_at" TIMESTAMP(3) NOT NULL,
  "title" TEXT NOT NULL, "subtitle" TEXT, "description" TEXT, "category" TEXT, "icon_url" TEXT, "episode" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "live_tv_programs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "live_tv_leases" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "account_id" UUID NOT NULL, "user_id" UUID NOT NULL,
  "profile_id" UUID NOT NULL, "device_id" UUID NOT NULL, "channel_id" UUID NOT NULL, "source_id" UUID NOT NULL,
  "connection_id" UUID NOT NULL, "status" TEXT NOT NULL DEFAULT 'preparing', "method" TEXT NOT NULL,
  "stream_token_hash" TEXT NOT NULL, "job_id" UUID, "is_cast_session" BOOLEAN NOT NULL DEFAULT false,
  "runtime_state" TEXT NOT NULL DEFAULT 'starting', "current_bitrate" INTEGER, "buffer_ahead_ms" INTEGER,
  "stall_count" INTEGER NOT NULL DEFAULT 0, "lease_expires_at" TIMESTAMP(3) NOT NULL,
  "last_heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3), "last_error" TEXT, CONSTRAINT "live_tv_leases_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "live_tv_favorites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "account_id" UUID NOT NULL, "profile_id" UUID NOT NULL,
  "channel_id" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "live_tv_favorites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "live_tv_providers_account_id_name_key" ON "live_tv_providers"("account_id", "name");
CREATE INDEX "live_tv_providers_account_id_enabled_priority_idx" ON "live_tv_providers"("account_id", "enabled", "priority");
CREATE UNIQUE INDEX "live_tv_connections_provider_id_playlist_fingerprint_key" ON "live_tv_connections"("provider_id", "playlist_fingerprint");
CREATE INDEX "live_tv_connections_account_id_enabled_priority_idx" ON "live_tv_connections"("account_id", "enabled", "priority");
CREATE UNIQUE INDEX "live_tv_channels_account_id_canonical_key_key" ON "live_tv_channels"("account_id", "canonical_key");
CREATE INDEX "live_tv_channels_account_id_enabled_group_name_sort_order_idx" ON "live_tv_channels"("account_id", "enabled", "group_name", "sort_order");
CREATE INDEX "live_tv_channels_account_id_tvg_id_idx" ON "live_tv_channels"("account_id", "tvg_id");
CREATE UNIQUE INDEX "live_tv_channel_sources_connection_id_stream_fingerprint_key" ON "live_tv_channel_sources"("connection_id", "stream_fingerprint");
CREATE INDEX "live_tv_channel_sources_channel_id_enabled_priority_idx" ON "live_tv_channel_sources"("channel_id", "enabled", "priority");
CREATE UNIQUE INDEX "live_tv_epg_sources_provider_id_key" ON "live_tv_epg_sources"("provider_id");
CREATE INDEX "live_tv_epg_sources_account_id_enabled_idx" ON "live_tv_epg_sources"("account_id", "enabled");
CREATE UNIQUE INDEX "live_tv_programs_provider_id_channel_id_starts_at_title_key" ON "live_tv_programs"("provider_id", "channel_id", "starts_at", "title");
CREATE INDEX "live_tv_programs_account_id_channel_id_starts_at_ends_at_idx" ON "live_tv_programs"("account_id", "channel_id", "starts_at", "ends_at");
CREATE UNIQUE INDEX "live_tv_leases_stream_token_hash_key" ON "live_tv_leases"("stream_token_hash");
CREATE INDEX "live_tv_leases_account_id_status_lease_expires_at_idx" ON "live_tv_leases"("account_id", "status", "lease_expires_at");
CREATE INDEX "live_tv_leases_user_id_status_lease_expires_at_idx" ON "live_tv_leases"("user_id", "status", "lease_expires_at");
CREATE INDEX "live_tv_leases_connection_id_status_lease_expires_at_idx" ON "live_tv_leases"("connection_id", "status", "lease_expires_at");
CREATE UNIQUE INDEX "live_tv_favorites_profile_id_channel_id_key" ON "live_tv_favorites"("profile_id", "channel_id");
CREATE INDEX "live_tv_favorites_account_id_profile_id_idx" ON "live_tv_favorites"("account_id", "profile_id");

ALTER TABLE "live_tv_providers" ADD CONSTRAINT "live_tv_providers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_connections" ADD CONSTRAINT "live_tv_connections_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_connections" ADD CONSTRAINT "live_tv_connections_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "live_tv_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_channels" ADD CONSTRAINT "live_tv_channels_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_channel_sources" ADD CONSTRAINT "live_tv_channel_sources_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "live_tv_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_channel_sources" ADD CONSTRAINT "live_tv_channel_sources_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "live_tv_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_epg_sources" ADD CONSTRAINT "live_tv_epg_sources_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_epg_sources" ADD CONSTRAINT "live_tv_epg_sources_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "live_tv_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_programs" ADD CONSTRAINT "live_tv_programs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_programs" ADD CONSTRAINT "live_tv_programs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "live_tv_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_programs" ADD CONSTRAINT "live_tv_programs_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "live_tv_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_leases" ADD CONSTRAINT "live_tv_leases_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_leases" ADD CONSTRAINT "live_tv_leases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_leases" ADD CONSTRAINT "live_tv_leases_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_leases" ADD CONSTRAINT "live_tv_leases_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_leases" ADD CONSTRAINT "live_tv_leases_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "live_tv_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "live_tv_leases" ADD CONSTRAINT "live_tv_leases_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "live_tv_channel_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "live_tv_leases" ADD CONSTRAINT "live_tv_leases_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "live_tv_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "live_tv_favorites" ADD CONSTRAINT "live_tv_favorites_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_favorites" ADD CONSTRAINT "live_tv_favorites_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_tv_favorites" ADD CONSTRAINT "live_tv_favorites_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "live_tv_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
