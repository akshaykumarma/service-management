ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_unique_idx" ON "users" USING btree ("username");