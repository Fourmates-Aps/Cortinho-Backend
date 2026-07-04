-- Public Collection Profiles
-- Adds username + profile settings to users, isPublic to cards

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "username"        varchar(40)  UNIQUE,
  ADD COLUMN IF NOT EXISTS "profile_public"  boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "show_values"     boolean      NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "bio"             text;

ALTER TABLE "cards"
  ADD COLUMN IF NOT EXISTS "is_public"       boolean      NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_username" ON "users" ("username")
  WHERE "username" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_cards_public" ON "cards" ("user_id", "is_public")
  WHERE "is_public" = true AND "deleted_at" IS NULL;
