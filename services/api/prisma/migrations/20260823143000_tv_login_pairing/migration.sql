CREATE TABLE "tv_login_pairings" (
  "id" TEXT NOT NULL,
  "approve_token_hash" TEXT NOT NULL,
  "poll_token_hash" TEXT NOT NULL,
  "user_code_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "account_id" TEXT,
  "user_id" TEXT,
  "profile_id" TEXT,
  "device_id" TEXT,
  "refresh_token_id" TEXT,
  "device_fingerprint" TEXT NOT NULL,
  "device_name" TEXT NOT NULL,
  "device_type" TEXT NOT NULL,
  "platform" TEXT,
  "app_version" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "approved_at" TIMESTAMP(3),
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tv_login_pairings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tv_login_pairings_approve_token_hash_key" ON "tv_login_pairings"("approve_token_hash");
CREATE UNIQUE INDEX "tv_login_pairings_poll_token_hash_key" ON "tv_login_pairings"("poll_token_hash");
CREATE UNIQUE INDEX "tv_login_pairings_user_code_hash_key" ON "tv_login_pairings"("user_code_hash");
CREATE INDEX "tv_login_pairings_status_expires_at_idx" ON "tv_login_pairings"("status", "expires_at");
CREATE INDEX "tv_login_pairings_account_id_user_id_status_idx" ON "tv_login_pairings"("account_id", "user_id", "status");
