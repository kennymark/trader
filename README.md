# Trader — Stock Notification App

Full-stack watchlist, historical charts, dip analytics, and multi-channel price alerts.

No login for now — auth code is present but hidden behind `AUTH_ENABLED` / `VITE_AUTH_ENABLED` (default `false`). The API scopes data to a local user until you flip those flags.

## Stack

- **Web:** Vite, React, TanStack Query, TanStack Router, Lightweight Charts
- **API:** Hono, Better Auth (optional), Drizzle, Yahoo Finance
- **DB:** PostgreSQL
- **Alerts:** node-cron worker → Email (Resend), Telegram, Twist

## Quick start

### 1. Database

```bash
docker compose up -d
# or apply SQL manually:
# psql -d trader -f apps/api/drizzle/0000_init.sql
```

Default connection string:

```
postgresql://trader:trader@localhost:5432/trader
```

### 2. Environment

```bash
cp .env.example apps/api/.env
# optional web flag (also in apps/web/.env):
# VITE_AUTH_ENABLED=false
```

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection |
| `AUTH_ENABLED` | API: `true` to require sessions (default `false`) |
| `VITE_AUTH_ENABLED` | Web: `true` to show Sign in / login page |
| `BETTER_AUTH_SECRET` | Session secret (needed when auth is on) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `LOCAL_USER_ID` | Used while auth is off |
| `RESEND_API_KEY` / `EMAIL_FROM` | Email alerts (dry-runs if unset) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` | Telegram bot |
| `TWIST_ACCESS_TOKEN` | Optional global Twist token |

### 3. Install & run

```bash
npm install
npm run build -w @trader/shared
npm run dev:api   # http://localhost:3001
npm run dev:web   # http://localhost:5173
```

Open the web app — no sign-in required while auth flags are false.

To turn auth back on: set `AUTH_ENABLED=true` in `apps/api/.env` and `VITE_AUTH_ENABLED=true` in `apps/web/.env`, then restart both.

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

Every 2 minutes (configurable via `ALERT_CRON`), the API evaluates rules, delivers to channels, and writes `alert_events`. Without provider API keys, deliveries are logged as dry-runs.

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
