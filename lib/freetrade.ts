export type FreetradeSide = "buy" | "sell";

export type ParsedFreetradeTx = {
  externalId: string | null;
  type: string;
  side: FreetradeSide | null;
  symbol: string | null;
  isin: string | null;
  title: string | null;
  account: string | null;
  quantity: number | null;
  price: number | null;
  totalAmount: number | null;
  currency: string | null;
  fxFeeAmount: number | null;
  stampDuty: number | null;
  tradedAt: Date | null;
  raw: Record<string, string>;
};

export type ComputedHolding = {
  symbol: string;
  displayName: string | null;
  isin: string | null;
  quantity: number;
  averageCost: number | null;
  costBasis: number | null;
  currency: string;
};

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Minimal CSV parser that handles quoted fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    // Skip trailing empty lines
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      pushField();
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function num(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pick(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = row[key];
    if (v != null && v.trim() !== "") return v.trim();
  }
  return undefined;
}

function detectSide(type: string, buySell: string | undefined): FreetradeSide | null {
  const bs = (buySell || "").trim().toUpperCase();
  if (bs === "BUY") return "buy";
  if (bs === "SELL") return "sell";

  const t = type.trim().toUpperCase();
  if (t === "BUY" || t === "FREESHARE" || t === "FREESHARE_ORDER") return "buy";
  if (t === "SELL") return "sell";
  if (t.includes("BUY")) return "buy";
  if (t.includes("SELL")) return "sell";
  return null;
}

function isTradeType(type: string, side: FreetradeSide | null): boolean {
  const t = type.trim().toUpperCase();
  if (side) return true;
  return (
    t === "ORDER" ||
    t === "FREESHARE_ORDER" ||
    t === "BUY" ||
    t === "SELL" ||
    t.includes("ORDER")
  );
}

/**
 * Parse a Freetrade Activity CSV export into normalized transactions.
 * Column names vary across Freetrade export generations — headers are matched loosely.
 */
export function parseFreetradeCsv(csvText: string): ParsedFreetradeTx[] {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error("CSV has no data rows");
  }

  const headers = rows[0]!.map(normalizeHeader);
  const hasTicker = headers.includes("ticker");
  const hasTitle = headers.includes("title");
  const hasType = headers.includes("type");
  if (!hasType || (!hasTicker && !hasTitle)) {
    throw new Error(
      "Does not look like a Freetrade activity export (need Type plus Ticker or Title columns)",
    );
  }

  const out: ParsedFreetradeTx[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!;
    const raw: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      raw[headers[c]!] = cells[c] ?? "";
    }

    const type = pick(raw, "type") || "UNKNOWN";
    const side = detectSide(type, pick(raw, "buy sell", "buy/sell", "side"));
    const symbolRaw = pick(raw, "ticker", "symbol");
    const symbol = symbolRaw ? symbolRaw.toUpperCase() : null;
    const quantity = num(pick(raw, "quantity", "dividend eligible quantity"));
    const price = num(
      pick(
        raw,
        "price per share in account currency",
        "price per share",
        "price",
      ),
    );
    const totalAmount = num(
      pick(raw, "total amount", "total amount in account currency", "total shares amount"),
    );
    const timestamp = pick(raw, "timestamp", "date", "time");
    const tradedAt = timestamp ? new Date(timestamp) : null;
    const orderId = pick(raw, "order id", "orderid", "id");
    const externalId =
      orderId ||
      (timestamp && symbol
        ? `${type}:${symbol}:${timestamp}:${quantity ?? ""}:${side ?? ""}`
        : null);

    out.push({
      externalId,
      type,
      side: isTradeType(type, side) ? side : null,
      symbol,
      isin: pick(raw, "isin") || null,
      title: pick(raw, "title", "name") || null,
      account: pick(raw, "account", "account name", "account type") || null,
      quantity,
      price,
      totalAmount,
      currency: pick(raw, "account currency", "instrument currency", "currency") || null,
      fxFeeAmount: num(pick(raw, "fx fee amount", "fx fee")),
      stampDuty: num(pick(raw, "stamp duty")),
      tradedAt: tradedAt && !Number.isNaN(tradedAt.getTime()) ? tradedAt : null,
      raw,
    });
  }

  return out;
}

/**
 * Build open positions from buy/sell trades using average-cost accounting.
 */
export function computeHoldingsFromTrades(txs: ParsedFreetradeTx[]): ComputedHolding[] {
  type Acc = {
    symbol: string;
    displayName: string | null;
    isin: string | null;
    quantity: number;
    costBasis: number;
    currency: string;
  };

  const map = new Map<string, Acc>();

  const trades = [...txs]
    .filter((t) => t.symbol && t.side && t.quantity != null && t.quantity > 0)
    .sort((a, b) => {
      const at = a.tradedAt?.getTime() ?? 0;
      const bt = b.tradedAt?.getTime() ?? 0;
      return at - bt;
    });

  for (const tx of trades) {
    const symbol = tx.symbol!;
    const qty = tx.quantity!;
    const currency = tx.currency || "GBP";
    let acc = map.get(symbol);
    if (!acc) {
      acc = {
        symbol,
        displayName: tx.title,
        isin: tx.isin,
        quantity: 0,
        costBasis: 0,
        currency,
      };
      map.set(symbol, acc);
    }
    if (tx.title) acc.displayName = tx.title;
    if (tx.isin) acc.isin = tx.isin;

    if (tx.side === "buy") {
      const spend =
        tx.totalAmount != null && tx.totalAmount > 0
          ? tx.totalAmount
          : tx.price != null
            ? tx.price * qty
            : 0;
      acc.costBasis += spend;
      acc.quantity += qty;
    } else if (tx.side === "sell") {
      applyInferredSplit(acc, qty);
      if (acc.quantity <= 0) continue;
      const sellQty = Math.min(qty, acc.quantity);
      const avg = acc.quantity > 0 ? acc.costBasis / acc.quantity : 0;
      acc.costBasis = Math.max(0, acc.costBasis - avg * sellQty);
      acc.quantity -= sellQty;
    }
  }

  return [...map.values()]
    .filter((h) => h.quantity > 1e-8)
    .map((h) => ({
      symbol: h.symbol,
      displayName: h.displayName,
      isin: h.isin,
      quantity: h.quantity,
      averageCost: h.quantity > 0 ? h.costBasis / h.quantity : null,
      costBasis: h.costBasis,
      currency: h.currency,
    }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** Freetrade sometimes omits split rows; a sell that is a clean multiple of shares held is treated as a split. */
function inferSplitRatio(held: number, sellQty: number): number | null {
  if (held <= 1e-8 || sellQty <= held * 1.25) return null;
  const r = sellQty / held;
  const nearest = Math.round(r);
  if (nearest >= 3 && Math.abs(r - nearest) / nearest <= 0.03) return nearest;
  return null;
}

function applyInferredSplit(acc: { quantity: number }, sellQty: number) {
  const ratio = inferSplitRatio(acc.quantity, sellQty);
  if (ratio) acc.quantity *= ratio;
}

export type QuoteMark = {
  symbol: string;
  price: number;
  currency: string;
};

export type PositionTrade = {
  date: string;
  type: "buy" | "sell" | "dividend" | "split";
  quantity: number | null;
  price: number | null;
  total: number | null;
  note: string | null;
};

export type SymbolPerformance = {
  key: string;
  symbol: string;
  aliases: string[];
  displayName: string | null;
  isin: string | null;
  status: "open" | "closed";
  quantityHeld: number;
  buyCount: number;
  sellCount: number;
  sharesBought: number;
  sharesSold: number;
  invested: number;
  proceeds: number;
  dividends: number;
  fees: number;
  realizedPnl: number;
  unrealizedPnl: number | null;
  totalPnl: number;
  returnPct: number | null;
  averageCost: number | null;
  averageBuyPrice: number | null;
  averageSellPrice: number | null;
  costBasis: number;
  marketValue: number | null;
  price: number | null;
  priceCurrency: string | null;
  firstBoughtAt: string | null;
  lastActivityAt: string | null;
  holdDays: number | null;
  currency: string;
  trades: PositionTrade[];
};

export type PortfolioInsight = {
  id: string;
  title: string;
  detail: string;
  tone: "good" | "bad" | "neutral";
};

export type PortfolioPerformance = {
  currency: string;
  generatedAt: string;
  symbolCount: number;
  openCount: number;
  closedCount: number;
  invested: number;
  proceeds: number;
  dividends: number;
  interest: number;
  deposits: number;
  withdrawals: number;
  fees: number;
  realizedPnl: number;
  realizedProfit: number;
  realizedLoss: number;
  unrealizedPnl: number | null;
  totalPnl: number;
  winCount: number;
  lossCount: number;
  winRatePct: number | null;
  best: { symbol: string; displayName: string | null; pnl: number } | null;
  worst: { symbol: string; displayName: string | null; pnl: number } | null;
  insights: PortfolioInsight[];
  positions: SymbolPerformance[];
  series: PnlMonthPoint[];
};

export type PnlMonthPoint = {
  month: string;
  pnl: number;
  cumulative: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function groupKey(tx: ParsedFreetradeTx): string | null {
  if (tx.isin && tx.isin.trim()) return tx.isin.trim();
  if (tx.symbol) return tx.symbol;
  return null;
}

function feeOf(tx: ParsedFreetradeTx): number {
  return (tx.fxFeeAmount ?? 0) + (tx.stampDuty ?? 0);
}

function cashType(type: string): "deposit" | "withdrawal" | "interest" | "other" {
  const t = type.trim().toUpperCase();
  if (t === "TOP_UP" || t === "DEPOSIT" || t.includes("TOP_UP") || t.includes("DEPOSIT")) {
    return "deposit";
  }
  if (t === "WITHDRAWAL" || t.includes("WITHDRAW")) return "withdrawal";
  if (t.includes("INTEREST")) return "interest";
  return "other";
}

/**
 * Average-cost realized P&L in account currency, plus dividends and optional marks.
 * Positions with the same ISIN (ticker changes like SQ → XYZ) are merged.
 */
export function computePortfolioPerformance(
  txs: ParsedFreetradeTx[],
  opts?: {
    quotes?: QuoteMark[];
    /** Units of GBP per 1 unit of quote currency, e.g. USD: 0.74 */
    fxToGbp?: Record<string, number>;
    now?: Date;
  },
): PortfolioPerformance {
  const now = opts?.now ?? new Date();
  const quoteBySymbol = new Map<string, QuoteMark>();
  for (const q of opts?.quotes ?? []) {
    quoteBySymbol.set(q.symbol.toUpperCase(), q);
    quoteBySymbol.set(q.symbol.toUpperCase().replace(/-/g, "."), q);
  }
  const fxToGbp = opts?.fxToGbp ?? {};

  type Acc = {
    key: string;
    symbol: string;
    aliases: Set<string>;
    displayName: string | null;
    isin: string | null;
    quantity: number;
    costBasis: number;
    currency: string;
    buyCount: number;
    sellCount: number;
    sharesBought: number;
    sharesSold: number;
    invested: number;
    proceeds: number;
    dividends: number;
    fees: number;
    realizedPnl: number;
    firstBoughtAt: Date | null;
    lastActivityAt: Date | null;
    lastClosedAt: Date | null;
    trades: PositionTrade[];
  };

  const map = new Map<string, Acc>();
  let deposits = 0;
  let withdrawals = 0;
  let interest = 0;
  let currency = "GBP";
  const curveEvents: { t: Date; delta: number }[] = [];
  const recordPnl = (tx: ParsedFreetradeTx, delta: number) => {
    if (!tx.tradedAt || !Number.isFinite(delta) || delta === 0) return;
    curveEvents.push({ t: tx.tradedAt, delta });
  };

  const chronological = [...txs].sort((a, b) => {
    const at = a.tradedAt?.getTime() ?? 0;
    const bt = b.tradedAt?.getTime() ?? 0;
    return at - bt;
  });

  for (const tx of chronological) {
    if (tx.currency) currency = tx.currency;
    const kind = cashType(tx.type);
    if (kind !== "other" && !tx.symbol && !tx.isin) {
      const amt = tx.totalAmount ?? 0;
      if (kind === "deposit") deposits += amt;
      else if (kind === "withdrawal") withdrawals += amt;
      else if (kind === "interest") interest += amt;
      continue;
    }

    const key = groupKey(tx);
    if (!key) continue;

    let acc = map.get(key);
    if (!acc) {
      acc = {
        key,
        symbol: tx.symbol || key,
        aliases: new Set(),
        displayName: tx.title,
        isin: tx.isin,
        quantity: 0,
        costBasis: 0,
        currency: tx.currency || currency,
        buyCount: 0,
        sellCount: 0,
        sharesBought: 0,
        sharesSold: 0,
        invested: 0,
        proceeds: 0,
        dividends: 0,
        fees: 0,
        realizedPnl: 0,
        firstBoughtAt: null,
        lastActivityAt: null,
        lastClosedAt: null,
        trades: [],
      };
      map.set(key, acc);
    }

    if (tx.symbol) {
      acc.symbol = tx.symbol;
      acc.aliases.add(tx.symbol);
    }
    if (tx.title) acc.displayName = tx.title;
    if (tx.isin) acc.isin = tx.isin;
    if (tx.currency) acc.currency = tx.currency;
    if (tx.tradedAt) acc.lastActivityAt = tx.tradedAt;

    const type = tx.type.trim().toUpperCase();
    if (type === "DIVIDEND" || type.includes("DIVIDEND")) {
      const amt = tx.totalAmount ?? 0;
      acc.dividends += amt;
      recordPnl(tx, amt);
      acc.trades.push({
        date: tx.tradedAt?.toISOString() ?? "",
        type: "dividend",
        quantity: tx.quantity,
        price: tx.price,
        total: amt,
        note: tx.title,
      });
      continue;
    }
    if (type.includes("SPLIT")) {
      const from = Number(tx.raw["stock split rate of share outturn from"] || "");
      const to = Number(tx.raw["stock split rate of share outturn to"] || "");
      if (from > 0 && to > 0) acc.quantity *= to / from;
      acc.trades.push({
        date: tx.tradedAt?.toISOString() ?? "",
        type: "split",
        quantity: null,
        price: null,
        total: null,
        note: from > 0 && to > 0 ? `${from}:1 → ${to}:1` : null,
      });
      continue;
    }

    if (!tx.side || tx.quantity == null || tx.quantity <= 0) continue;

    const qty = tx.quantity;
    const fees = feeOf(tx);
    acc.fees += fees;

    if (tx.side === "buy") {
      const spend =
        tx.totalAmount != null && tx.totalAmount > 0
          ? tx.totalAmount
          : tx.price != null
            ? tx.price * qty
            : 0;
      acc.costBasis += spend;
      acc.quantity += qty;
      acc.invested += spend;
      acc.buyCount += 1;
      acc.sharesBought += qty;
      if (!acc.firstBoughtAt && tx.tradedAt) acc.firstBoughtAt = tx.tradedAt;
      acc.trades.push({
        date: tx.tradedAt?.toISOString() ?? "",
        type: "buy",
        quantity: qty,
        price: qty > 0 ? round2(spend / qty) : null,
        total: round2(spend),
        note: null,
      });
    } else {
      applyInferredSplit(acc, qty);
      const proceeds =
        tx.totalAmount != null && tx.totalAmount > 0
          ? tx.totalAmount
          : tx.price != null
            ? tx.price * qty
            : 0;
      acc.proceeds += proceeds;
      acc.sellCount += 1;
      acc.sharesSold += qty;
      acc.trades.push({
        date: tx.tradedAt?.toISOString() ?? "",
        type: "sell",
        quantity: qty,
        price: qty > 0 ? round2(proceeds / qty) : null,
        total: round2(proceeds),
        note: null,
      });

      if (acc.quantity <= 1e-12) {
        acc.realizedPnl += proceeds;
        recordPnl(tx, proceeds);
        continue;
      }
      const sellQty = Math.min(qty, acc.quantity);
      const avg = acc.costBasis / acc.quantity;
      const matchedProceeds = qty > 0 ? proceeds * (sellQty / qty) : 0;
      const realized = matchedProceeds - avg * sellQty;
      acc.realizedPnl += realized;
      recordPnl(tx, realized);
      acc.costBasis = Math.max(0, acc.costBasis - avg * sellQty);
      acc.quantity -= sellQty;
      if (acc.quantity <= 1e-8) {
        acc.quantity = 0;
        acc.costBasis = 0;
        acc.lastClosedAt = tx.tradedAt;
      }
    }
  }

  const positions: SymbolPerformance[] = [...map.values()].map((acc) => {
    const held = acc.quantity > 1e-8;
    const status: "open" | "closed" = held ? "open" : "closed";
    const mark =
      quoteBySymbol.get(acc.symbol.toUpperCase()) ||
      [...acc.aliases].map((a) => quoteBySymbol.get(a.toUpperCase())).find(Boolean);

    let marketValue: number | null = null;
    let unrealizedPnl: number | null = null;
    let price: number | null = null;
    let priceCurrency: string | null = null;

    if (held && mark && Number.isFinite(mark.price)) {
      price = mark.price;
      priceCurrency = mark.currency;
      const quoteCcy = (mark.currency || "USD").toUpperCase();
      const holdCcy = (acc.currency || "GBP").toUpperCase();
      let pxGbp = mark.price;
      if (quoteCcy !== holdCcy) {
        const rate = fxToGbp[quoteCcy];
        if (rate != null && rate > 0) pxGbp = mark.price * rate;
        else pxGbp = Number.NaN;
      }
      if (Number.isFinite(pxGbp)) {
        marketValue = pxGbp * acc.quantity;
        unrealizedPnl = marketValue - acc.costBasis;
      }
    }

    const totalPnl = acc.realizedPnl + acc.dividends + (unrealizedPnl ?? 0);
    const returnPct = acc.invested > 0 ? (totalPnl / acc.invested) * 100 : null;

    let holdDays: number | null = null;
    if (acc.firstBoughtAt) {
      const end = held ? now : acc.lastClosedAt || acc.lastActivityAt || now;
      holdDays = Math.max(0, Math.round((end.getTime() - acc.firstBoughtAt.getTime()) / 86_400_000));
    }

    return {
      key: acc.key,
      symbol: acc.symbol,
      aliases: [...acc.aliases].filter((a) => a !== acc.symbol).sort(),
      displayName: acc.displayName,
      isin: acc.isin,
      status,
      quantityHeld: acc.quantity,
      buyCount: acc.buyCount,
      sellCount: acc.sellCount,
      sharesBought: acc.sharesBought,
      sharesSold: acc.sharesSold,
      invested: round2(acc.invested),
      proceeds: round2(acc.proceeds),
      dividends: round2(acc.dividends),
      fees: round2(acc.fees),
      realizedPnl: round2(acc.realizedPnl),
      unrealizedPnl: unrealizedPnl != null ? round2(unrealizedPnl) : null,
      totalPnl: round2(totalPnl),
      returnPct: returnPct != null ? Math.round(returnPct * 10) / 10 : null,
      averageCost: held && acc.quantity > 0 ? round2(acc.costBasis / acc.quantity) : null,
      averageBuyPrice: acc.sharesBought > 0 ? round2(acc.invested / acc.sharesBought) : null,
      averageSellPrice: acc.sharesSold > 0 ? round2(acc.proceeds / acc.sharesSold) : null,
      costBasis: round2(acc.costBasis),
      marketValue: marketValue != null ? round2(marketValue) : null,
      price,
      priceCurrency,
      firstBoughtAt: acc.firstBoughtAt?.toISOString() ?? null,
      lastActivityAt: acc.lastActivityAt?.toISOString() ?? null,
      holdDays,
      currency: acc.currency,
      trades: acc.trades,
    };
  });

  positions.sort((a, b) => b.totalPnl - a.totalPnl);

  const realizedProfit = round2(
    positions.filter((p) => p.realizedPnl + p.dividends > 0).reduce((s, p) => s + p.realizedPnl + p.dividends, 0),
  );
  const realizedLoss = round2(
    positions.filter((p) => p.realizedPnl + p.dividends < 0).reduce((s, p) => s + p.realizedPnl + p.dividends, 0),
  );

  const classified = positions.filter((p) => p.status === "closed" || p.unrealizedPnl != null || p.sellCount > 0);
  const winCount = classified.filter((p) => p.totalPnl > 0.005).length;
  const lossCount = classified.filter((p) => p.totalPnl < -0.005).length;
  const decided = winCount + lossCount;

  const best = positions[0] && positions[0].totalPnl > 0
    ? { symbol: positions[0].symbol, displayName: positions[0].displayName, pnl: positions[0].totalPnl }
    : positions.find((p) => p.totalPnl !== 0)
      ? {
          symbol: positions[0]!.symbol,
          displayName: positions[0]!.displayName,
          pnl: positions[0]!.totalPnl,
        }
      : null;
  const worstPos = [...positions].sort((a, b) => a.totalPnl - b.totalPnl)[0];
  const worst =
    worstPos && worstPos.totalPnl < 0
      ? { symbol: worstPos.symbol, displayName: worstPos.displayName, pnl: worstPos.totalPnl }
      : null;

  const unrealParts = positions.map((p) => p.unrealizedPnl);
  const anyUnreal = unrealParts.some((v) => v != null);
  const unrealizedPnl = anyUnreal
    ? round2(unrealParts.reduce<number>((sum, v) => sum + (v ?? 0), 0))
    : null;

  const invested = round2(positions.reduce((s, p) => s + p.invested, 0));
  const proceeds = round2(positions.reduce((s, p) => s + p.proceeds, 0));
  const dividends = round2(positions.reduce((s, p) => s + p.dividends, 0));
  const fees = round2(positions.reduce((s, p) => s + p.fees, 0));
  const realizedPnl = round2(positions.reduce((s, p) => s + p.realizedPnl, 0));
  const totalPnl = round2(realizedPnl + dividends + (unrealizedPnl ?? 0));
  const series = foldMonthlySeries(curveEvents, now);

  const performance: PortfolioPerformance = {
    currency,
    generatedAt: now.toISOString(),
    symbolCount: positions.length,
    openCount: positions.filter((p) => p.status === "open").length,
    closedCount: positions.filter((p) => p.status === "closed").length,
    invested,
    proceeds,
    dividends,
    interest: round2(interest),
    deposits: round2(deposits),
    withdrawals: round2(withdrawals),
    fees,
    realizedPnl,
    realizedProfit,
    realizedLoss,
    unrealizedPnl,
    totalPnl,
    winCount,
    lossCount,
    winRatePct: decided > 0 ? Math.round((winCount / decided) * 1000) / 10 : null,
    best,
    worst,
    insights: [],
    positions,
    series,
  };
  performance.insights = buildPortfolioInsights(performance);
  return performance;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function foldMonthlySeries(events: { t: Date; delta: number }[], now: Date): PnlMonthPoint[] {
  if (events.length === 0) return [];
  const monthly = new Map<string, number>();
  for (const e of events) {
    const k = monthKey(e.t);
    monthly.set(k, (monthly.get(k) ?? 0) + e.delta);
  }
  const start = events.reduce((a, e) => (e.t < a ? e.t : a), events[0]!.t);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const out: PnlMonthPoint[] = [];
  let cum = 0;
  while (cursor <= end) {
    const month = monthKey(cursor);
    const pnl = monthly.get(month) ?? 0;
    cum += pnl;
    out.push({ month, pnl: round2(pnl), cumulative: round2(cum) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function gbp(n: number, currency = "GBP"): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const sign = n < 0 ? "−" : "";
  return currency === "GBP" ? `${sign}£${formatted}` : `${sign}${formatted} ${currency}`;
}

export function buildPortfolioInsights(p: PortfolioPerformance): PortfolioInsight[] {
  const insights: PortfolioInsight[] = [];
  const { currency } = p;

  insights.push({
    id: "net",
    title: p.totalPnl >= 0 ? "Net trading profit" : "Net trading loss",
    detail:
      p.unrealizedPnl != null
        ? `${gbp(p.totalPnl, currency)} including ${gbp(p.realizedPnl + p.dividends, currency)} realized/dividends and ${gbp(p.unrealizedPnl, currency)} still open.`
        : `${gbp(p.totalPnl, currency)} from closed trades and dividends (open lots are marked at cost until a live quote is available).`,
    tone: p.totalPnl >= 0 ? "good" : "bad",
  });

  insights.push({
    id: "split",
    title: "Winners vs losers",
    detail: `${gbp(p.realizedProfit, currency)} across ${p.winCount} names that made money vs ${gbp(p.realizedLoss, currency)} across ${p.lossCount} that lost. Win rate ${p.winRatePct ?? "—"}%.`,
    tone: p.realizedProfit >= Math.abs(p.realizedLoss) ? "good" : "bad",
  });

  const winners = p.positions.filter((x) => x.totalPnl > 0);
  const grossProfit = winners.reduce((s, x) => s + x.totalPnl, 0);
  if (p.best && grossProfit > 0) {
    const share = Math.round((p.best.pnl / grossProfit) * 100);
    if (share >= 40) {
      insights.push({
        id: "concentration",
        title: `${p.best.displayName || p.best.symbol} did the heavy lifting`,
        detail: `${share}% of all winning P&L came from this one name (${gbp(p.best.pnl, currency)}). Results are concentrated.`,
        tone: "neutral",
      });
    }
  }

  if (p.worst) {
    insights.push({
      id: "worst",
      title: `Biggest hole: ${p.worst.displayName || p.worst.symbol}`,
      detail: `${gbp(p.worst.pnl, currency)} on that name. Filter to losses to see the rest of the graveyard.`,
      tone: "bad",
    });
  }

  if (p.fees > 0 && p.invested > 0) {
    const pct = Math.round((p.fees / p.invested) * 1000) / 10;
    insights.push({
      id: "fees",
      title: "FX and stamp costs",
      detail: `${gbp(p.fees, currency)} in FX/stamp (${pct}% of capital deployed). These are already inside buy/sell totals, so they are not subtracted again from P&L.`,
      tone: "neutral",
    });
  }

  if (p.dividends > 1) {
    insights.push({
      id: "dividends",
      title: "Dividends collected",
      detail: `${gbp(p.dividends, currency)} net dividends in account currency — counted in each name’s total P&L.`,
      tone: "good",
    });
  }

  const openCost = p.positions.filter((x) => x.status === "open").reduce((s, x) => s + x.costBasis, 0);
  if (openCost > 0) {
    insights.push({
      id: "open",
      title: `${p.openCount} names still open`,
      detail: `${gbp(openCost, currency)} of cost basis is still in the market. Closed names: ${p.closedCount}.`,
      tone: "neutral",
    });
  }

  const neverSold = p.positions
    .filter((x) => x.status === "open" && x.sellCount === 0 && x.invested >= 200)
    .sort((a, b) => b.invested - a.invested);
  if (neverSold.length) {
    const names = neverSold
      .slice(0, 4)
      .map((x) => x.displayName || x.symbol)
      .join(", ");
    insights.push({
      id: "bags",
      title: "Bought and never sold",
      detail: `${neverSold.length} holdings were never trimmed (${names}${neverSold.length > 4 ? "…" : ""}). These only show as wins/losses once marked or sold.`,
      tone: "neutral",
    });
  }

  const closed = p.positions.filter((x) => x.status === "closed" && x.holdDays != null);
  const closedWins = closed.filter((x) => x.totalPnl > 0);
  const closedLosses = closed.filter((x) => x.totalPnl < 0);
  if (closedWins.length >= 2 && closedLosses.length >= 2) {
    const avg = (xs: SymbolPerformance[]) =>
      Math.round(xs.reduce((s, x) => s + (x.holdDays ?? 0), 0) / xs.length);
    const w = avg(closedWins);
    const l = avg(closedLosses);
    insights.push({
      id: "hold",
      title: w >= l ? "Winners were held longer" : "Losers were held longer",
      detail: `Closed winners sat for ~${w} days vs ~${l} days for closed losers.`,
      tone: "neutral",
    });
  }

  const mostTraded = [...p.positions].sort((a, b) => b.buyCount + b.sellCount - (a.buyCount + a.sellCount))[0];
  if (mostTraded && mostTraded.buyCount + mostTraded.sellCount >= 8) {
    insights.push({
      id: "active",
      title: `Most active: ${mostTraded.displayName || mostTraded.symbol}`,
      detail: `${mostTraded.buyCount} buys and ${mostTraded.sellCount} sells · ${gbp(mostTraded.totalPnl, currency)} total P&L.`,
      tone: mostTraded.totalPnl >= 0 ? "good" : "bad",
    });
  }

  if (p.deposits > 0) {
    insights.push({
      id: "cash",
      title: "ISA cash movement",
      detail: `${gbp(p.deposits, currency)} paid in, ${gbp(p.withdrawals, currency)} withdrawn, ${gbp(p.interest, currency)} cash interest.`,
      tone: "neutral",
    });
  }

  const renamed = p.positions.filter((x) => x.aliases.length > 0);
  if (renamed.length) {
    insights.push({
      id: "rename",
      title: "Ticker changes merged",
      detail: renamed
        .map((x) => `${x.aliases.join("/")} → ${x.symbol} (${x.displayName || "same company"})`)
        .join("; ") + ".",
      tone: "neutral",
    });
  }

  return insights;
}

/** Rebuild a parsed tx from a stored broker_transactions row. */
export function parsedTxFromStored(row: {
  externalId: string | null;
  type: string;
  side: string | null;
  symbol: string | null;
  isin: string | null;
  title: string | null;
  account: string | null;
  quantity: string | number | null;
  price: string | number | null;
  totalAmount: string | number | null;
  currency: string | null;
  tradedAt: Date | string | null;
  raw: Record<string, unknown> | null;
}): ParsedFreetradeTx {
  const raw: Record<string, string> = {};
  if (row.raw && typeof row.raw === "object") {
    for (const [k, v] of Object.entries(row.raw)) {
      raw[k] = v == null ? "" : String(v);
    }
  }
  const asNum = (v: string | number | null | undefined) => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const tradedAt =
    row.tradedAt instanceof Date
      ? row.tradedAt
      : row.tradedAt
        ? new Date(row.tradedAt)
        : null;
  return {
    externalId: row.externalId,
    type: row.type,
    side: row.side === "buy" || row.side === "sell" ? row.side : null,
    symbol: row.symbol,
    isin: row.isin,
    title: row.title,
    account: row.account,
    quantity: asNum(row.quantity),
    price: asNum(row.price),
    totalAmount: asNum(row.totalAmount),
    currency: row.currency,
    fxFeeAmount: asNum(raw["fx fee amount"] || raw["fx fee"]),
    stampDuty: asNum(raw["stamp duty"]),
    tradedAt: tradedAt && !Number.isNaN(tradedAt.getTime()) ? tradedAt : null,
    raw,
  };
}
