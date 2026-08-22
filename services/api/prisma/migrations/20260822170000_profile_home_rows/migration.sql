ALTER TABLE "profile_preferences"
ADD COLUMN "home_row_order" JSONB NOT NULL DEFAULT '["recommendations","continue","new_movies","new_series"]',
ADD COLUMN "hidden_home_rows" JSONB NOT NULL DEFAULT '[]';
