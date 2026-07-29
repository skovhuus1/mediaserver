ALTER TABLE "users"
ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "profiles"
ADD COLUMN "archived_at" TIMESTAMP(3);

ALTER TABLE "refresh_tokens"
ADD COLUMN "profile_id" TEXT;

CREATE INDEX "profiles_account_id_user_id_archived_at_idx"
ON "profiles"("account_id", "user_id", "archived_at");

CREATE INDEX "refresh_tokens_profile_id_revoked_at_idx"
ON "refresh_tokens"("profile_id", "revoked_at");
