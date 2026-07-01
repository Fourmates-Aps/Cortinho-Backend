CREATE TABLE "cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"category" varchar(16) DEFAULT 'other' NOT NULL,
	"player" varchar(256),
	"team" varchar(256),
	"year" smallint,
	"set_name" varchar(256),
	"card_number" varchar(64),
	"parallel" varchar(128),
	"serial_number" varchar(64),
	"is_rookie" boolean DEFAULT false NOT NULL,
	"is_autographed" boolean DEFAULT false NOT NULL,
	"is_patch" boolean DEFAULT false NOT NULL,
	"is_graded" boolean DEFAULT false NOT NULL,
	"grade_company_id" smallint,
	"grade_value" numeric(4, 1),
	"cert_number" varchar(64),
	"condition" varchar(16),
	"purchase_price" numeric(12, 2),
	"current_value" numeric(12, 2),
	"purchase_date" date,
	"acquisition_method" varchar(16),
	"price_source" varchar(256),
	"image_url" text,
	"image_back_url" text,
	"notes" text,
	"status" varchar(16) DEFAULT 'collection' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grading_companies" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"abbr" varchar(8) NOT NULL,
	CONSTRAINT "grading_companies_name_unique" UNIQUE("name"),
	CONSTRAINT "grading_companies_abbr_unique" UNIQUE("abbr")
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"name" varchar(64) NOT NULL,
	"display_url" varchar(256),
	CONSTRAINT "platforms_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_id" integer NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"note" varchar(256),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "psa_cert_cache" (
	"cert_number" varchar(64) PRIMARY KEY NOT NULL,
	"result_json" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sealed_price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"sealed_product_id" integer NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"source" varchar(16) DEFAULT 'manual' NOT NULL,
	"note" varchar(256),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sealed_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"category" varchar(16) DEFAULT 'other' NOT NULL,
	"set_name" varchar(256),
	"product_type" varchar(128),
	"language" varchar(64),
	"year" smallint,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"purchase_price" numeric(12, 2),
	"current_value" numeric(12, 2),
	"purchase_date" date,
	"image_url" text,
	"notes" text,
	"status" varchar(16) DEFAULT 'collection' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"card_id" integer,
	"type" varchar(8) NOT NULL,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"counterparty" varchar(256),
	"platform_id" smallint,
	"platform_custom" varchar(128),
	"traded_for" varchar(256),
	"note" text,
	"transaction_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_id" varchar(256) NOT NULL,
	"email" varchar(256) NOT NULL,
	"first_name" varchar(128),
	"last_name" varchar(128),
	"role" varchar(16) DEFAULT 'user' NOT NULL,
	"currency" char(3) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_grade_company_id_grading_companies_id_fk" FOREIGN KEY ("grade_company_id") REFERENCES "public"."grading_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sealed_price_history" ADD CONSTRAINT "sealed_price_history_sealed_product_id_sealed_products_id_fk" FOREIGN KEY ("sealed_product_id") REFERENCES "public"."sealed_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sealed_products" ADD CONSTRAINT "sealed_products_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cards_user_id" ON "cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_cards_user_status" ON "cards" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_cards_user_category" ON "cards" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "idx_cards_user_created" ON "cards" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_cards_cert" ON "cards" USING btree ("cert_number");--> statement-breakpoint
CREATE INDEX "idx_cards_graded" ON "cards" USING btree ("user_id","grade_company_id","grade_value");--> statement-breakpoint
CREATE INDEX "idx_ph_card_date" ON "price_history" USING btree ("card_id","recorded_at");--> statement-breakpoint
CREATE INDEX "idx_psa_fetched" ON "psa_cert_cache" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "idx_sph_product_date" ON "sealed_price_history" USING btree ("sealed_product_id","recorded_at");--> statement-breakpoint
CREATE INDEX "idx_sealed_user_status" ON "sealed_products" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_tx_user_date" ON "transactions" USING btree ("user_id","transaction_date");--> statement-breakpoint
CREATE INDEX "idx_tx_user_type" ON "transactions" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "idx_tx_card" ON "transactions" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_clerk_id" ON "users" USING btree ("clerk_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE VIEW "public"."v_card_pl" AS (select "cards"."id", "cards"."user_id", "cards"."name", "cards"."category", "cards"."status", "cards"."is_rookie", "cards"."is_autographed", "cards"."is_graded", "grading_companies"."abbr", "cards"."grade_value", "cards"."purchase_price", "cards"."current_value", ROUND("cards"."current_value" - "cards"."purchase_price", 2) as "pl_abs", 
        CASE WHEN "cards"."purchase_price" > 0
          THEN ROUND((("cards"."current_value" - "cards"."purchase_price") / "cards"."purchase_price") * 100, 2)
          ELSE NULL
        END as "pl_pct", "cards"."created_at" from "cards" left join "grading_companies" on "grading_companies"."id" = "cards"."grade_company_id" where "cards"."deleted_at" IS NULL);--> statement-breakpoint
CREATE VIEW "public"."v_collection_summary" AS (select "user_id", COUNT(*) as "total_cards", COUNT(*) FILTER (WHERE "status" = 'collection') as "collection_count", COUNT(*) FILTER (WHERE "status" = 'wishlist') as "wishlist_count", COUNT(*) FILTER (WHERE "status" = 'for_sale') as "for_sale_count", COUNT(*) FILTER (WHERE "is_graded" = TRUE) as "graded_count", COUNT(*) FILTER (WHERE "is_rookie" = TRUE) as "rookie_count", ROUND(SUM("current_value") FILTER (WHERE "status" = 'collection'), 2) as "total_value", ROUND(SUM("purchase_price") FILTER (WHERE "status" = 'collection'), 2) as "total_cost", ROUND(SUM("current_value" - "purchase_price") FILTER (WHERE "status" = 'collection' AND "purchase_price" IS NOT NULL AND "current_value" IS NOT NULL), 2) as "total_pl" from "cards" where "cards"."deleted_at" IS NULL group by "cards"."user_id");--> statement-breakpoint
CREATE VIEW "public"."v_transaction_summary" AS (select "user_id", COUNT(*) as "total_transactions", ROUND(SUM("price") FILTER (WHERE "type" = 'buy'), 2) as "total_spent", ROUND(SUM("price") FILTER (WHERE "type" = 'sell'), 2) as "total_earned", ROUND(COALESCE(SUM("price") FILTER (WHERE "type" = 'sell'), 0) - COALESCE(SUM("price") FILTER (WHERE "type" = 'buy'), 0), 2) as "net_pl" from "transactions" group by "transactions"."user_id");