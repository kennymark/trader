CREATE TABLE IF NOT EXISTS "opportunity_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "symbol" text NOT NULL,
  "opportunity_score" integer NOT NULL,
  "risk_score" integer NOT NULL,
  "conviction_score" integer NOT NULL,
  "price" numeric(18, 6),
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intelligence_predictions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "symbol" text NOT NULL,
  "thesis" text NOT NULL,
  "action" text NOT NULL,
  "opportunity_score" integer NOT NULL,
  "conviction_score" integer NOT NULL,
  "price_at_prediction" numeric(18, 6),
  "target_price" numeric(18, 6),
  "predicted_at" timestamp DEFAULT now() NOT NULL,
  "evaluations" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intelligence_feed_events" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "symbol" text,
  "kind" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "score" integer,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunity_snapshots" ADD CONSTRAINT "opportunity_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intelligence_predictions" ADD CONSTRAINT "intelligence_predictions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intelligence_feed_events" ADD CONSTRAINT "intelligence_feed_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
