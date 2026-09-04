CREATE TABLE IF NOT EXISTS "broker_connections" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "provider" text NOT NULL,
  "label" text NOT NULL,
  "last_synced_at" timestamp,
  "transaction_count" integer DEFAULT 0 NOT NULL,
  "holding_count" integer DEFAULT 0 NOT NULL,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "broker_transactions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "connection_id" text NOT NULL,
  "provider" text NOT NULL,
  "external_id" text,
  "type" text NOT NULL,
  "side" text,
  "symbol" text,
  "isin" text,
  "title" text,
  "account" text,
  "quantity" numeric(24, 8),
  "price" numeric(18, 6),
  "total_amount" numeric(18, 6),
  "currency" text,
  "traded_at" timestamp,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_holdings" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "connection_id" text NOT NULL,
  "provider" text NOT NULL,
  "symbol" text NOT NULL,
  "display_name" text,
  "isin" text,
  "quantity" numeric(24, 8) NOT NULL,
  "average_cost" numeric(18, 6),
  "cost_basis" numeric(18, 6),
  "currency" text DEFAULT 'GBP' NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "broker_connections" ADD CONSTRAINT "broker_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "broker_transactions" ADD CONSTRAINT "broker_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "broker_transactions" ADD CONSTRAINT "broker_transactions_connection_id_broker_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."broker_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_connection_id_broker_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."broker_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "broker_user_provider" ON "broker_connections" USING btree ("user_id","provider");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "broker_tx_connection_external" ON "broker_transactions" USING btree ("connection_id","external_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "portfolio_holdings_user_provider_symbol" ON "portfolio_holdings" USING btree ("user_id","provider","symbol");
