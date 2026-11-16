CREATE TABLE "levels" (
	"game_id" text NOT NULL,
	"level_id" text NOT NULL,
	"order" bigint NOT NULL,
	"version" bigint NOT NULL,
	"topology" text NOT NULL,
	"section" jsonb NOT NULL,
	CONSTRAINT "levels_game_id_level_id_pk" PRIMARY KEY("game_id","level_id")
);
