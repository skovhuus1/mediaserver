CREATE TABLE "client_push_registrations" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "profile_id" TEXT,
    "device_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "app_version" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_push_registrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "profile_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "delivery_status" TEXT NOT NULL DEFAULT 'queued',
    "delivery_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_crash_reports" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "profile_id" TEXT,
    "device_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "app_version" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "context" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "last_occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_crash_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_push_registrations_token_key" ON "client_push_registrations"("token");
CREATE INDEX "client_push_registrations_account_id_user_id_profile_id_idx" ON "client_push_registrations"("account_id", "user_id", "profile_id");
CREATE INDEX "client_push_registrations_device_id_enabled_idx" ON "client_push_registrations"("device_id", "enabled");
CREATE INDEX "user_notifications_account_id_user_id_profile_id_created_at_idx" ON "user_notifications"("account_id", "user_id", "profile_id", "created_at");
CREATE INDEX "user_notifications_delivery_status_created_at_idx" ON "user_notifications"("delivery_status", "created_at");
CREATE INDEX "client_crash_reports_account_id_last_occurred_at_idx" ON "client_crash_reports"("account_id", "last_occurred_at");
CREATE INDEX "client_crash_reports_device_id_fingerprint_last_occurred_at_idx" ON "client_crash_reports"("device_id", "fingerprint", "last_occurred_at");

ALTER TABLE "client_push_registrations" ADD CONSTRAINT "client_push_registrations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_push_registrations" ADD CONSTRAINT "client_push_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_push_registrations" ADD CONSTRAINT "client_push_registrations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_push_registrations" ADD CONSTRAINT "client_push_registrations_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_crash_reports" ADD CONSTRAINT "client_crash_reports_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_crash_reports" ADD CONSTRAINT "client_crash_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_crash_reports" ADD CONSTRAINT "client_crash_reports_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "client_crash_reports" ADD CONSTRAINT "client_crash_reports_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
