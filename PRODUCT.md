# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner: a UK retail investor who trades through Freetrade and reviews their own
decisions after the fact, at a desk, not during a live trading session.

Secondary: a small number of people they know personally, each with their own
Freetrade export and their own account. Not aimed at strangers. Sign-in exists to
keep accounts separate, not to onboard a public audience.

## Product Purpose

A personal replacement for the broker's own interface. It brings a watchlist with
live quotes and charts, imported trade history with realized and open P&L, price
alerts, and opportunity scoring into one place, so the owner can watch, judge, and
review positions without opening Freetrade.

Success is that the owner reaches for this instead of their broker, and that it
answers questions the broker cannot.

## Positioning

Built on one person's real imported transaction ledger rather than a hypothetical
portfolio. Holding the full ledger is what lets it replay a decision: value the path
where a sell never happened, day by day, against the path actually taken and against
the index. A broker's app shows what you hold now. This shows what your choices were
worth.

## Operating Context

- Freetrade publishes no API, so history arrives as a CSV activity export the user
  uploads. Each import replaces the previous one, so a partial export loses data.
- The account is GBP while many holdings trade in USD, so prices convert at each
  day's rate.
- Positions group by ISIN, so a ticker change carries its history across.
- Alerts run unattended on a five-minute schedule and reach the user by email,
  Telegram, or Twist.
- Broker exports record shares as traded while price history is split-adjusted, so
  quantities must be restated before the two can be compared.

## Capabilities and Constraints

Confirmed capabilities: watchlist with live quotes and historical charts; per-symbol
analytics covering returns, volatility, drawdown, and dip recovery; Freetrade CSV
import; realized and open P&L with per-position trade sheets; comparison against the
S&P 500 and FTSE 100; the never-sold replay; opportunity scoring, catalysts,
predictions, and scenario simulation; price and percentage-move alert rules with
delivery channels.

Constraints future work must preserve:

- Freetrade CSV import and a GBP account currency. Not multi-broker, not
  multi-currency.
- The Hunt scoring is part of the product, not an experiment to be cut.
- Alerts and their delivery channels are core.
- Prices come from Yahoo Finance, with its gaps, delays, and occasional wrong
  values. Do not assume a paid data feed.

Terminology, as the interface uses it: Watchlist, The Hunt, Portfolio (the
imported P&L), positions, holdings, realized and open P&L.

Technical: React SPA on Vite; Convex backend with Node actions for market data;
Better Auth email and password. Realized P&L uses average cost and ignores tax
treatment entirely.

## Brand Commitments

Name: Trader. A chart-line mark serves as both logo and favicon. No other binding
identity constraints have been established.

## Evidence on Hand

- Real Freetrade activity exports are the source of the owner's data. None is
  committed to the repository.
- Screenshots under `docs/screenshots` use a synthetic portfolio whose trade prices
  are derived from real market history. They are not real holdings.
- No testimonials, customers, benchmarks, pricing, or press exist. Future work must
  not invent them.

## Product Principles

1. Tell the truth about performance, including when it is unflattering. The replay
   exists to make an uncomfortable number visible.
2. Numbers are the content; the interface should recede.
3. Say what a number assumes. Average cost, Yahoo prices, and daily FX are
   approximations and should read as such.
4. Five surfaces of equal standing. Watchlist, The Hunt, Portfolio, alerts, and settings
   are one terminal, not a core feature with satellites.
5. Never fabricate financial data. A missing price is stated, not filled in.
