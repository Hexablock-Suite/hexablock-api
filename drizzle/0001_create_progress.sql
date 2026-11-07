CREATE TABLE "level_results" (
	"user_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"level_id" text NOT NULL,
	"stars" integer NOT NULL,
	"moves" integer NOT NULL,
	"elapsed_ms" bigint NOT NULL,
	CONSTRAINT "level_results_user_id_game_id_level_id_pk" PRIMARY KEY("user_id","game_id","level_id")
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"user_id" uuid NOT NULL,
	"game_id" text NOT NULL,
	"high_score" bigint,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "progress_user_id_game_id_pk" PRIMARY KEY("user_id","game_id")
);
--> statement-breakpoint
ALTER TABLE "level_results" ADD CONSTRAINT "level_results_user_id_game_id_progress_user_id_game_id_fk" FOREIGN KEY ("user_id","game_id") REFERENCES "public"."progress"("user_id","game_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;