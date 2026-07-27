-- Prisma migration: BB-Media API baseline schema for phase-1

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "AccountStatus" AS ENUM ('active', 'suspended', 'disabled');
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE "SubscriptionStatus" AS ENUM ('pending', 'trialing', 'active', 'past_due', 'grace_period', 'paused', 'canceled', 'expired', 'suspended');
CREATE TYPE "PlaybackSessionStatus" AS ENUM ('reserving', 'active', 'paused', 'stopping', 'completed', 'disconnected', 'expired', 'terminated_by_admin', 'failed', 'user_stopped');
CREATE TYPE "LibraryType" AS ENUM ('movie', 'series', 'home_video');
CREATE TYPE "MediaType" AS ENUM ('movie', 'episode');

CREATE TABLE "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "server_name" text NOT NULL DEFAULT 'BoltBytes Media',
  "external_url" text,
  "language" text NOT NULL DEFAULT 'en',
  "timezone" text NOT NULL DEFAULT 'Europe/Copenhagen',
  "status" "AccountStatus" NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text NOT NULL UNIQUE,
  "description" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text NOT NULL UNIQUE,
  "description" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "display_name" text NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE
);

CREATE TABLE "profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "user_id" uuid,
  "name" text NOT NULL,
  "is_child_profile" boolean NOT NULL DEFAULT false,
  "pin_hash" text,
  "language" text NOT NULL DEFAULT 'en',
  "subtitle_preference" text NOT NULL DEFAULT 'default',
  "audio_preference" text NOT NULL DEFAULT 'default',
  "quality_profile" text NOT NULL DEFAULT 'auto',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE TABLE "role_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "role_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
  CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE,
  UNIQUE ("role_id", "permission_id")
);

CREATE TABLE "user_roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
  UNIQUE ("user_id", "role_id")
);

CREATE TABLE "devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "device_name" text NOT NULL,
  "device_type" text NOT NULL,
  "platform" text,
  "app_version" text,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_ip_address" text,
  "is_trusted" boolean NOT NULL DEFAULT false,
  "is_revoked" boolean NOT NULL DEFAULT false,
  "capabilities" jsonb NOT NULL,
  CONSTRAINT "devices_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  UNIQUE ("account_id", "device_name")
);

CREATE TABLE "refresh_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "token_hash" text NOT NULL UNIQUE,
  "user_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "device_id" uuid NOT NULL,
  "family_id" text NOT NULL,
  "revoked_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz,
  CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "refresh_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "refresh_tokens_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE
);

CREATE TABLE "plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "internal_code" text NOT NULL UNIQUE,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_public" boolean NOT NULL DEFAULT false,
  "price" numeric(12,2) NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'USD',
  "billing_interval" text NOT NULL DEFAULT 'monthly',
  "trial_days" integer NOT NULL DEFAULT 0,
  "grace_period_days" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "plan_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "plan_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "is_active" boolean NOT NULL DEFAULT false,
  "effective_at" timestamptz NOT NULL DEFAULT now(),
  "max_concurrent_streams" integer NOT NULL DEFAULT 1,
  "max_registered_devices" integer NOT NULL DEFAULT 1,
  "max_offline_downloads" integer NOT NULL DEFAULT 0,
  "max_video_resolution" integer DEFAULT 1080,
  "max_video_bitrate" integer DEFAULT 4000,
  "max_audio_channels" integer DEFAULT 2,
  "allow_direct_play" boolean NOT NULL DEFAULT true,
  "allow_direct_stream" boolean NOT NULL DEFAULT false,
  "allow_video_transcode" boolean NOT NULL DEFAULT false,
  "allow_audio_transcode" boolean NOT NULL DEFAULT false,
  "allow_subtitle_burn_in" boolean NOT NULL DEFAULT false,
  "allow_remote_streaming" boolean NOT NULL DEFAULT true,
  "allow_offline_downloads" boolean NOT NULL DEFAULT false,
  "allow_chromecast" boolean NOT NULL DEFAULT false,
  "allow_hdr" boolean NOT NULL DEFAULT false,
  "allow_dolby_vision" boolean NOT NULL DEFAULT false,
  "allow_lossless_audio" boolean NOT NULL DEFAULT false,
  "release_delay_months" integer NOT NULL DEFAULT 0,
  "release_delay_days" integer NOT NULL DEFAULT 0,
  "snapshot" jsonb NOT NULL,
  CONSTRAINT "plan_versions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE,
  UNIQUE ("plan_id", "version_number")
);

CREATE TABLE "plan_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "plan_version_id" uuid NOT NULL UNIQUE,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "plan_entitlements_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id") ON DELETE CASCADE
);

CREATE TABLE "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "user_id" uuid,
  "plan_version_id" uuid NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'pending',
  "starts_at" timestamptz NOT NULL DEFAULT now(),
  "ends_at" timestamptz,
  "suspended_until" timestamptz,
  "suspended_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "snapshot_at" timestamptz,
  CONSTRAINT "subscriptions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "subscriptions_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id") ON DELETE RESTRICT
);

CREATE TABLE "subscription_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "subscription_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "event_payload" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE
);

CREATE TABLE "subscription_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "subscription_id" uuid NOT NULL UNIQUE,
  "snapshot" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "subscription_snapshots_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE
);

CREATE TABLE "user_entitlement_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "overrides" jsonb NOT NULL,
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz,
  CONSTRAINT "user_entitlement_overrides_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "user_entitlement_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "storage_roots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "label" text NOT NULL,
  "mount_path" text NOT NULL,
  "type" text NOT NULL DEFAULT 'local',
  "is_readonly" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "storage_roots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE
);

CREATE TABLE "libraries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "storage_root_id" uuid NOT NULL,
  "name" text NOT NULL,
  "type" "LibraryType" NOT NULL DEFAULT 'movie',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "libraries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "libraries_storage_root_id_fkey" FOREIGN KEY ("storage_root_id") REFERENCES "storage_roots"("id") ON DELETE CASCADE
);

CREATE TABLE "library_paths" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "library_id" uuid NOT NULL,
  "path" text NOT NULL,
  "recursive" boolean NOT NULL DEFAULT true,
  "include_patterns" jsonb,
  "exclude_patterns" jsonb,
  CONSTRAINT "library_paths_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "libraries"("id") ON DELETE CASCADE
);

CREATE TABLE "media_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "library_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "media_type" "MediaType" NOT NULL,
  "metadata_release_date" timestamptz,
  "original_release_date" timestamptz,
  "digital_release_date" timestamptz,
  "physical_release_date" timestamptz,
  "first_air_date" timestamptz,
  "availability_date" timestamptz,
  "availability_override" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "media_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "media_items_library_id_fkey" FOREIGN KEY ("library_id") REFERENCES "libraries"("id") ON DELETE CASCADE
);

CREATE TABLE "playback_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "device_id" uuid NOT NULL,
  "media_id" uuid,
  "media_source_id" text,
  "playback_method" text NOT NULL,
  "stream_token" text NOT NULL,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "last_heartbeat_at" timestamptz,
  "lease_expires_at" timestamptz NOT NULL,
  "ended_at" timestamptz,
  "status" "PlaybackSessionStatus" NOT NULL DEFAULT 'reserving',
  "is_local" boolean NOT NULL DEFAULT false,
  "is_cast_session" boolean NOT NULL DEFAULT false,
  "ip_address" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "playback_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "playback_sessions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "playback_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "playback_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT,
  CONSTRAINT "playback_sessions_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_items"("id") ON DELETE RESTRICT
);

CREATE TABLE "stream_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "playback_session_id" uuid NOT NULL UNIQUE,
  "account_id" uuid NOT NULL,
  "device_id" uuid NOT NULL,
  "media_id" uuid,
  "reserved_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "released_at" timestamptz,
  "reason" text,
  CONSTRAINT "stream_reservations_session_id_fkey" FOREIGN KEY ("playback_session_id") REFERENCES "playback_sessions"("id") ON DELETE CASCADE
);

CREATE TABLE "playback_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "playback_session_id" uuid NOT NULL,
  "media_id" uuid,
  "device_id" uuid NOT NULL,
  "position_ms" integer NOT NULL DEFAULT 0,
  "played_ms" integer NOT NULL DEFAULT 0,
  "completed" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "playback_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "playback_history_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT,
  CONSTRAINT "playback_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "playback_history_session_id_fkey" FOREIGN KEY ("playback_session_id") REFERENCES "playback_sessions"("id") ON DELETE CASCADE,
  CONSTRAINT "playback_history_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_items"("id") ON DELETE SET NULL
);

CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid,
  "user_id" uuid,
  "profile_id" uuid,
  "device_id" text,
  "session_id" text,
  "category" text NOT NULL,
  "action" text NOT NULL,
  "reason" text,
  "details" jsonb,
  "ip_address" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "audit_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL,
  CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "audit_logs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL
);

CREATE TABLE "system_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "account_id" uuid NOT NULL,
  "setting_key" text NOT NULL,
  "setting_value" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "system_settings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE,
  UNIQUE ("account_id", "setting_key")
);

CREATE TABLE "system_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "queue_name" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb,
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "job_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id" uuid NOT NULL,
  "attempt" integer NOT NULL,
  "status" text NOT NULL,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "finished_at" timestamptz,
  "error" text,
  CONSTRAINT "job_attempts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "system_jobs"("id") ON DELETE CASCADE
);

CREATE TABLE "billing_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" text NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "processed" boolean NOT NULL DEFAULT false,
  "retry_count" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz,
  UNIQUE ("provider", "event_id")
);

CREATE INDEX "accounts_created_at_idx" ON "accounts" ("created_at");
CREATE INDEX "users_account_id_idx" ON "users" ("account_id");
CREATE INDEX "users_account_id_email_idx" ON "users" ("account_id", "email");
CREATE UNIQUE INDEX "users_account_id_email_key" ON "users" ("account_id", "email");
CREATE INDEX "profiles_account_id_idx" ON "profiles" ("account_id");
CREATE INDEX "profiles_user_id_idx" ON "profiles" ("user_id");
CREATE INDEX "devices_account_id_idx" ON "devices" ("account_id");
CREATE INDEX "devices_user_id_idx" ON "devices" ("user_id");
CREATE INDEX "refresh_tokens_account_id_idx" ON "refresh_tokens" ("account_id");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" ("user_id");
CREATE INDEX "refresh_tokens_device_id_idx" ON "refresh_tokens" ("device_id");
CREATE INDEX "subscriptions_account_id_idx" ON "subscriptions" ("account_id");
CREATE INDEX "subscriptions_plan_version_id_idx" ON "subscriptions" ("plan_version_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" ("status");
CREATE INDEX "subscription_events_subscription_id_idx" ON "subscription_events" ("subscription_id");
CREATE INDEX "subscription_snapshots_subscription_id_idx" ON "subscription_snapshots" ("subscription_id");
CREATE INDEX "user_entitlement_overrides_account_id_idx" ON "user_entitlement_overrides" ("account_id");
CREATE INDEX "user_entitlement_overrides_user_id_idx" ON "user_entitlement_overrides" ("user_id");
CREATE INDEX "user_entitlement_overrides_expires_at_idx" ON "user_entitlement_overrides" ("expires_at");
CREATE INDEX "storage_roots_account_id_idx" ON "storage_roots" ("account_id");
CREATE INDEX "libraries_account_id_idx" ON "libraries" ("account_id");
CREATE INDEX "libraries_storage_root_id_idx" ON "libraries" ("storage_root_id");
CREATE INDEX "library_paths_library_id_idx" ON "library_paths" ("library_id");
CREATE INDEX "media_items_account_id_idx" ON "media_items" ("account_id");
CREATE INDEX "media_items_library_id_idx" ON "media_items" ("library_id");
CREATE INDEX "media_items_media_type_idx" ON "media_items" ("media_type");
CREATE INDEX "playback_sessions_account_id_idx" ON "playback_sessions" ("account_id");
CREATE INDEX "playback_sessions_user_id_idx" ON "playback_sessions" ("user_id");
CREATE INDEX "playback_sessions_status_idx" ON "playback_sessions" ("status");
CREATE INDEX "playback_sessions_lease_expires_at_idx" ON "playback_sessions" ("lease_expires_at");
CREATE INDEX "stream_reservations_account_id_idx" ON "stream_reservations" ("account_id");
CREATE INDEX "stream_reservations_device_id_idx" ON "stream_reservations" ("device_id");
CREATE INDEX "playback_history_account_id_idx" ON "playback_history" ("account_id");
CREATE INDEX "playback_history_user_id_idx" ON "playback_history" ("user_id");
CREATE INDEX "playback_history_profile_id_idx" ON "playback_history" ("profile_id");
CREATE INDEX "playback_history_playback_session_id_idx" ON "playback_history" ("playback_session_id");
CREATE INDEX "audit_logs_account_id_idx" ON "audit_logs" ("account_id");
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" ("user_id");
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" ("created_at");
CREATE INDEX "system_jobs_status_idx" ON "system_jobs" ("status");
CREATE INDEX "job_attempts_job_id_idx" ON "job_attempts" ("job_id");

