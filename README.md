# Trader — Watchlist, Paper P&L, and Price Alerts

Track a watchlist, import your broker history, and find out what your selling actually cost you.

No login for now — auth code is present but hidden behind `AUTH_ENABLED` / `VITE_AUTH_ENABLED` (default `false`). The API scopes data to a local user until you flip those flags.

![Watchlist and chart](docs/screenshots/watchlist.png)

## Highlights

- **Watchlist + charts.** Live quotes, historical candles, and non-AI analytics per symbol.
- **Paper.** Import a Freetrade activity CSV to get realized and open P&L, per-position trade sheets, and a comparison against the S&P 500 and FTSE 100.
- **If you had never sold.** Pick any position you sold and replay it against the market.
- **The Hunt.** Opportunity scoring, catalysts, and scenario simulation, with optional AI rationales.
- **Alerts.** Price and percentage-move rules delivered to email, Telegram, or Twist.

## If you had never sold

Open any sold position on the Paper page and the drawer replays it three ways, valued day by day from the same buys:

| Path | What it assumes |
|------|-----------------|
| What you did | Shares still held marked to market, plus the cash each sale raised, plus dividends |
| If you had held | Every share ever bought is still held today, dividends scaled to that larger share count |
| If you bought the index | Each sale's proceeds go into the S&P 500 on the sale date |

![The never-sold replay](docs/screenshots/whatif-panel.png)

Broker exports record shares as traded, while Yahoo closes are split-adjusted, so a pre-split buy would otherwise be counted at a fraction of its real size. Rather than trust split rows that exports often omit, each trade's price is compared against the adjusted close that day. The ratio between them is the split factor, and it is snapped onto a known split ratio only when it lands close to one. Anything ambiguous falls back to the broker's own split records.

The counterfactual deliberately assumes nothing else changed. That flatters holding, since in reality the money went somewhere, which is why the index path sits alongside it.

## Paper P&L

![Paper P&L](docs/screenshots/portfolio.png)

Positions are grouped by ISIN, so a ticker change carries its history across. Realized P&L uses average cost. Open positions are marked with live quotes and converted to account currency at each day's rate.

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

Migrations live in `apps/api/drizzle` and apply in order: `0000_init`, `0001_channel_symbol`, `0002_intelligence`, `0003_freetrade`.

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
| `DEEPSEEK_API_KEY` | Optional AI rationales on The Hunt |
| `VITE_API_URL` | Web: API base URL when it is not same-origin |

### 3. Install & run

```bash
npm install
npm run build -w @trader/shared
npm run dev:api   # http://localhost:3001
npm run dev:web   # http://localhost:5173
```

Open the web app — no sign-in required while auth flags are false.

To turn auth back on: set `AUTH_ENABLED=true` in `apps/api/.env` and `VITE_AUTH_ENABLED=true` in `apps/web/.env`, then restart both.

### 4. Tests

```bash
npm test
```

## App surfaces

| Route | What it does |
|-------|----------------|
| `/` | Watchlist, historical chart, per-symbol analytics, alerts and channels |
| `/intelligence` | The Hunt: opportunity scores, catalysts, predictions, scenarios |
| `/portfolio` | Paper: imported broker P&L, per-position drawers, vs-market comparison |
| `/settings` | Broker import, channels, Telegram link |

## Importing from Freetrade

Freetrade has no public API, so the import takes the activity CSV export. Drop the file on either the Settings page or the Paper page, and transactions, holdings, and optionally your watchlist are populated. Each import replaces the previous one rather than merging into it, so always upload a full export rather than a slice.

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

## Deploying to Vercel + Neon

The web build and the API ship from one Vercel project. `api/[...path].ts` serves the same Hono app used locally, so `/api/*` is same-origin and needs no `VITE_API_URL`. Alerts run from a Vercel Cron trigger instead of node-cron.

1. **Database.** Create a Neon project and copy the **pooled** connection string, the host containing `-pooler`. Apply the four migrations in `apps/api/drizzle` in order.
2. **Environment.** Set these on the Vercel project:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | Neon pooled connection string |
| `AUTH_ENABLED` / `VITE_AUTH_ENABLED` | `true` — see the warning below |
| `BETTER_AUTH_SECRET` | A long random string |
| `API_ORIGIN` / `WEB_ORIGIN` | The deployment URL, e.g. `https://trader.vercel.app` |
| `CRON_SECRET` | A long random string, sent by Vercel Cron as a bearer token |

3. **Deploy.** `vercel --prod`. The build runs shared, then API, then web.

> **Turn auth on before exposing a deployment.** With `AUTH_ENABLED=false` every request is scoped to a single local user, so anyone who opens the URL sees and can modify that portfolio. That default is fine on localhost and wrong on the public internet.

Two things behave differently in serverless. The database client holds one connection per invocation with prepared statements off, because Neon's pooler runs in transaction mode. And Vercel's Hobby plan only allows daily cron, so `vercel.json` schedules alerts hourly; anything more frequent needs a Pro plan or an external scheduler hitting `/api/cron/alerts`.

## Project layout

```
api               Vercel function entry (serves the Hono app)
apps/web          React SPA
apps/api          Hono API + cron worker
packages/shared   Zod schemas + shared types
docs/screenshots  README images
```

## A note on the numbers

This is a personal tracking tool, not advice. Prices come from Yahoo Finance and can be wrong, delayed, or missing. Realized P&L uses average cost and ignores tax treatment entirely.

Screenshots use a synthetic portfolio, not real holdings.
