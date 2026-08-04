# Trader — Stock Notification App

Full-stack watchlist, historical charts, dip analytics, and multi-channel price alerts.

## Stack

- **Web:** Vite, React, TanStack Query, TanStack Router, Lightweight Charts
- **API:** Hono, Better Auth (Google + email), Drizzle, Yahoo Finance
- **DB:** PostgreSQL
- **Alerts:** node-cron worker → Email (Resend), Telegram, Twist

## Quick start

### 1. Database

Option A — Docker:

```bash
docker compose up -d
```

Option B — local Postgres (already used if Docker is unavailable):

```bash
# create role/db if needed, then:
psql -d trader -f apps/api/drizzle/0000_init.sql
```

Default connection string:

```
postgresql://trader:trader@localhost:5432/trader
```

### 2. Environment

```bash
cp .env.example apps/api/.env
```

Fill in at least:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection |
| `BETTER_AUTH_SECRET` | Session secret (long random string) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (optional; email signup works without) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Email alerts (dry-runs to console if unset) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` | Telegram bot |
| `TWIST_ACCESS_TOKEN` | Optional global Twist token |

### 3. Install & run

```bash
npm install
npm run build -w @trader/shared
npm run dev:api   # http://localhost:3001
npm run dev:web   # http://localhost:5173
```

Sign up with email/password, or configure Google OAuth and use **Continue with Google**.

## App surfaces

| Route | What it does |
|-------|----------------|
| `/` | Two-pane watchlist + historical chart + analytics |
| `/alerts` | Create price / % dip rules, view fire history |
| `/settings/channels` | Email, Telegram link, Twist |

## Analytics (non-AI)

For the selected range and customizable inputs:

- Average daily / weekly / monthly returns
- Volatility and max drawdown
- Dip recovery: avg bounce and days to recover after ≥X% dips
- What-if P/L for $1,000 / $10,000 (or any amount)

## Alerts worker

Every 2 minutes (configurable via `ALERT_CRON`), the API:

1. Loads enabled rules
2. Fetches Yahoo quotes (with in-memory cache + retries)
3. Evaluates above / below / % drop / % rise
4. Respects per-rule cooldowns
5. Delivers to selected channels and writes `alert_events`

Without provider API keys, deliveries are logged as dry-runs so local testing still works.

## Telegram setup

1. Create a bot with BotFather; set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`
2. Point the webhook at `POST /api/telegram/webhook` (optional secret header)
3. In the app, open **Channels → Generate Telegram link** and tap Start

## Project layout

```
apps/web          React SPA
apps/api          Hono API + cron worker
packages/shared   Zod schemas + shared types
```
