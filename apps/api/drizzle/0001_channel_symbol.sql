ALTER TABLE "notification_channels" ADD COLUMN IF NOT EXISTS "symbol" text;
ALTER TABLE "telegram_link_tokens" ADD COLUMN IF NOT EXISTS "symbol" text;
