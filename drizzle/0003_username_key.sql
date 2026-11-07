DROP INDEX "users_username_lower_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username_key" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key_unique" ON "users" USING btree ("username_key");