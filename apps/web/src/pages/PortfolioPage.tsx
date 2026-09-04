import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  MarketCompareResult,
  PortfolioInsight,
  PortfolioPerformance,
  PositionTrade,
  SymbolPerformance,
} from "@trader/shared";
import {
  CumulativePnlChart,
  MonthlyPnlChart,
  NamePnlChart,
  WinLossChart,
  YearCompareChart,
} from "../components/PnlCharts";
import { Drawer } from "../components/Drawer";
import {
  fetchMarketCompare,
  fetchPortfolioPerformance,
  importFreetradeCsv,
} from "../lib/queries";
import { formatDate, formatDateTime } from "../lib/dates";
import { CacheNotice } from "../components/CacheNotice";
import { WhatIfPanel } from "../components/WhatIfPanel";

type Filter = "all" | "winners" | "losers" | "open" | "closed" | "never_sold";
type SortKey =
  | "pnl"
  | "realized"
  | "openPnl"
  | "return"
  | "invested"
  | "proceeds"
  | "dividends"
  | "activity"
  | "name";
type SortDir = "desc" | "asc";

const SORT_OPTIONS: Array<{ id: SortKey; label: string }> = [
  { id: "pnl", label: "Total P&L" },
  { id: "realized", label: "Realized" },
  { id: "openPnl", label: "Open P&L" },
  { id: "return", label: "Return %" },
  { id: "invested", label: "Capital in" },
  { id: "proceeds", label: "Proceeds" },
  { id: "dividends", label: "Dividends" },
  { id: "activity", label: "Most trades" },
  { id: "name", label: "Name" },
];

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All names" },
  { id: "winners", label: "Winners" },
  { id: "losers", label: "Losers" },
  { id: "open", label: "Still holding" },
  { id: "closed", label: "Closed" },
  { id: "never_sold", label: "Never sold" },
];

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50];

function money(n: number | null | undefined, currency = "GBP") {
  if (n == null || Number.isNaN(n)) return "—";
  const formatted = Math.abs(n).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = n < 0 ? "−" : "";
  if (currency === "GBP") return `${sign}£${formatted}`;
  return `${sign}${formatted} ${currency}`;
}

function moneyHero(n: number) {
  const formatted = Math.abs(n).toLocaleString("en-GB", { maximumFractionDigits: 0 });
  return n < 0 ? `−£${formatted}` : `£${formatted}`;
}

function pnlClass(n: number | null | undefined) {
  if (n == null || Math.abs(n) < 0.005) return "";
  return n > 0 ? "pnl-up" : "pnl-down";
}

function matchesFilter(p: SymbolPerformance, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "winners") return p.totalPnl > 0.005;
  if (filter === "losers") return p.totalPnl < -0.005;
  if (filter === "open") return p.status === "open";
  if (filter === "closed") return p.status === "closed";
  if (filter === "never_sold") return p.sellCount === 0 && p.buyCount > 0;
  return true;
}

function sortArrow(col: SortKey, sort: SortKey, dir: SortDir): string {
  if (sort !== col) return "";
  return dir === "asc" ? " ↑" : " ↓";
}

export function PortfolioPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("pnl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [vsMarketOpen, setVsMarketOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const data = useQuery({
    queryKey: ["portfolio-performance"],
    queryFn: fetchPortfolioPerformance,
  });

  const vsMarket = useQuery({
    queryKey: ["portfolio-vs-market"],
    queryFn: fetchMarketCompare,
    enabled: vsMarketOpen,
    staleTime: 10 * 60_000,
  });

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const csv = await file.text();
      return importFreetradeCsv(csv, false);
    },
    onSuccess: () => {
      setLocalError(null);
      qc.invalidateQueries({ queryKey: ["portfolio-performance"] });
      qc.invalidateQueries({ queryKey: ["portfolio-vs-market"] });
      qc.invalidateQueries({ queryKey: ["freetrade"] });
      qc.invalidateQueries({ queryKey: ["portfolio-health"] });
      qc.invalidateQueries({ queryKey: ["intelligence"] });
    },
    onError: (err) => setLocalError((err as Error).message),
  });

  const performance = data.data?.performance ?? null;
  const connection = data.data?.connection ?? null;

  const rows = useMemo(() => {
    if (!performance) return [];
    const q = query.trim().toLowerCase();
    const filtered = performance.positions.filter((p) => {
      if (!matchesFilter(p, filter)) return false;
      if (!q) return true;
      return (
        p.symbol.toLowerCase().includes(q) ||
        (p.displayName || "").toLowerCase().includes(q) ||
        p.aliases.some((a) => a.toLowerCase().includes(q))
      );
    });
    return [...filtered].sort((a, b) => {
      let cmp: number;
      switch (sort) {
        case "name":
          cmp = (a.displayName || a.symbol).localeCompare(b.displayName || b.symbol);
          break;
        case "invested":
          cmp = a.invested - b.invested;
          break;
        case "proceeds":
          cmp = a.proceeds - b.proceeds;
          break;
        case "dividends":
          cmp = a.dividends - b.dividends;
          break;
        case "return":
          cmp = (a.returnPct ?? -9999) - (b.returnPct ?? -9999);
          break;
        case "activity":
          cmp = a.buyCount + a.sellCount - (b.buyCount + b.sellCount);
          break;
        case "realized":
          cmp = a.realizedPnl - b.realizedPnl;
          break;
        case "openPnl":
          cmp = (a.unrealizedPnl ?? -9999) - (b.unrealizedPnl ?? -9999);
          break;
        default:
          cmp = a.totalPnl - b.totalPnl;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [performance, filter, sort, sortDir, query]);

  useEffect(() => {
    setPage(0);
  }, [filter, sort, query, pageSize]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const shownPnl = rows.reduce((s, r) => s + r.totalPnl, 0);
  const shownInvested = rows.reduce((s, r) => s + r.invested, 0);

  const selected =
    performance && selectedKey
      ? performance.positions.find((p) => p.key === selectedKey) ?? null
      : null;

  function selectPosition(key: string) {
    setSelectedKey((cur) => (cur === key ? null : key));
  }

  return (
    <div className="pnl-page">
      <div className="pnl-head">
        <div>
          <h1>Statement of account</h1>
          <p className="page-lead">
            Profit, loss, and what’s still open — all in account currency.
          </p>
        </div>
        <div className="pnl-head-actions">
          <button
            type="button"
            className="btn"
            disabled={!connection}
            onClick={() => setVsMarketOpen(true)}
          >
            Vs market
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={importMut.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {importMut.isPending ? "Importing…" : connection ? "Re-import CSV" : "Import CSV"}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) importMut.mutate(file);
          }}
        />
      </div>

      {(localError || importMut.isError) && (
        <div className="form-error" style={{ marginBottom: "1rem" }}>
          {localError || (importMut.error as Error).message}
        </div>
      )}

      <CacheNotice updatedAt={data.dataUpdatedAt} refreshing={data.isFetching} />

      {data.isLoading ? (
        <div className="muted">Crunching the ledger…</div>
      ) : data.isError && !data.data ? (
        <div className="form-error">{(data.error as Error).message}</div>
      ) : !performance ? (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>No Freetrade activity yet</div>
          <p className="muted" style={{ margin: 0 }}>
            Export Activity CSV from Freetrade and import it here, or from{" "}
            <Link to="/settings">Settings</Link>.
          </p>
        </div>
      ) : (
        <PortfolioBody
          performance={performance}
          connectionLabel={
            connection?.lastSyncedAt
              ? `${performance.symbolCount} names · ${connection.transactionCount} rows · imported ${formatDateTime(connection.lastSyncedAt)}`
              : `${performance.symbolCount} names`
          }
          filter={filter}
          setFilter={setFilter}
          sort={sort}
          setSort={setSort}
          sortDir={sortDir}
          setSortDir={setSortDir}
          query={query}
          setQuery={setQuery}
          rows={rows}
          pageRows={pageRows}
          page={safePage}
          pageCount={pageCount}
          pageSize={pageSize}
          setPage={setPage}
          setPageSize={setPageSize}
          shownPnl={shownPnl}
          shownInvested={shownInvested}
          selectedKey={selectedKey}
          onSelect={selectPosition}
          selected={selected}
          onCloseDetail={() => setSelectedKey(null)}
        />
      )}

      <Drawer
        open={vsMarketOpen}
        title="You vs the market"
        onClose={() => setVsMarketOpen(false)}
        size="wide"
      >
        <div className="pnl-detail">
          {vsMarket.isLoading ? (
            <div className="muted">Loading S&amp;P 500 and FTSE 100…</div>
          ) : vsMarket.isError ? (
            <div className="form-error">{(vsMarket.error as Error).message}</div>
          ) : vsMarket.data?.comparison ? (
            <MarketCompareBody comparison={vsMarket.data.comparison} />
          ) : (
            <div className="muted">Import your Freetrade CSV first to compare.</div>
          )}
        </div>
      </Drawer>
    </div>
  );
}

function PortfolioBody({
  performance,
  connectionLabel,
  filter,
  setFilter,
  sort,
  setSort,
  sortDir,
  setSortDir,
  query,
  setQuery,
  rows,
  pageRows,
  page,
  pageCount,
  pageSize,
  setPage,
  setPageSize,
  shownPnl,
  shownInvested,
  selectedKey,
  onSelect,
  selected,
  onCloseDetail,
}: {
  performance: PortfolioPerformance;
  connectionLabel: string;
  filter: Filter;
  setFilter: (f: Filter) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  sortDir: SortDir;
  setSortDir: (d: SortDir) => void;
  query: string;
  setQuery: (q: string) => void;
  rows: SymbolPerformance[];
  pageRows: SymbolPerformance[];
  page: number;
  pageCount: number;
  pageSize: number;
  setPage: (p: number) => void;
  setPageSize: (n: number) => void;
  shownPnl: number;
  shownInvested: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  selected: SymbolPerformance | null;
  onCloseDetail: () => void;
}) {
  const featured = performance.insights
    .filter((i) =>
      ["concentration", "worst", "bags", "hold", "active", "rename"].includes(i.id),
    )
    .slice(0, 4);

  function sortBy(col: SortKey) {
    if (sort === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSort(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
  }

  return (
    <>
      <p className="muted pnl-meta">{connectionLabel}</p>

      <section className="pnl-hero-grid">
        <div className="pnl-hero">
          <div className="account-line">
            <span className="account-line-label">Net result</span>
            <span className="account-line-leader" aria-hidden="true" />
            <span className={`pnl-hero-value tabular ${pnlClass(performance.totalPnl)}`}>
              {moneyHero(performance.totalPnl)}
            </span>
          </div>
          <p className="muted">
            {moneyHero(performance.realizedPnl + performance.dividends)} realized &amp; dividends
            {performance.unrealizedPnl != null
              ? ` · ${moneyHero(performance.unrealizedPnl)} still open`
              : ""}
          </p>
          <div className="pnl-hero-stats">
            <MiniStat label="Deployed" value={moneyHero(performance.invested)} />
            <MiniStat label="Dividends" value={moneyHero(performance.dividends)} />
            <MiniStat
            label="Open"
            value={`${performance.openCount} ${performance.openCount === 1 ? "name" : "names"}`}
          />
            <MiniStat label="FX / stamp" value={moneyHero(performance.fees)} />
          </div>
        </div>
        <div className="pnl-hero-panel">
          <div className="pnl-chart-title">Winners vs losers</div>
          <WinLossChart
            profit={performance.realizedProfit}
            loss={performance.realizedLoss}
            winCount={performance.winCount}
            lossCount={performance.lossCount}
            winRatePct={performance.winRatePct}
          />
        </div>
      </section>

      <section className="pnl-chart-grid">
        <CumulativePnlChart series={performance.series} />
        <MonthlyPnlChart series={performance.series} />
        <NamePnlChart rows={rows} selected={selectedKey} onSelect={onSelect} />
        {featured.length ? (
          <div className="pnl-chart pnl-notes">
            <div className="pnl-chart-title">Notes from the ledger</div>
            <div className="pnl-note-list">
              {featured.map((ins) => (
                <InsightNote key={ins.id} insight={ins} />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <div className="hunt-filters" style={{ margin: "0.35rem 0 0.75rem" }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? "active" : ""}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="pnl-toolbar">
        <input
          className="pnl-search"
          placeholder="Search ticker or name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="muted">
          Sort{" "}
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-ghost pnl-dir-btn"
          onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
          title={sortDir === "asc" ? "Low to high" : "High to low"}
        >
          {sortDir === "asc" ? "↑ Low" : "↓ High"}
        </button>
        <div className="muted">
          {rows.length} shown · {moneyHero(shownPnl)} on {moneyHero(shownInvested)} in
        </div>
      </div>

      <div className="intel-table-wrap pnl-ledger">
        <table className="intel-table pnl-table">
          <thead>
            <tr>
              <th className="pnl-th-sort" onClick={() => sortBy("name")}>
                Stock {sortArrow("name", sort, sortDir)}
              </th>
              <th>Status</th>
              <th className="pnl-th-sort" onClick={() => sortBy("invested")}>
                In {sortArrow("invested", sort, sortDir)}
              </th>
              <th className="pnl-th-sort" onClick={() => sortBy("proceeds")}>
                Out {sortArrow("proceeds", sort, sortDir)}
              </th>
              <th className="pnl-th-sort" onClick={() => sortBy("dividends")}>
                Div {sortArrow("dividends", sort, sortDir)}
              </th>
              <th className="pnl-th-sort" onClick={() => sortBy("realized")}>
                Realized {sortArrow("realized", sort, sortDir)}
              </th>
              <th className="pnl-th-sort" onClick={() => sortBy("openPnl")}>
                Open P&amp;L {sortArrow("openPnl", sort, sortDir)}
              </th>
              <th className="pnl-th-sort" onClick={() => sortBy("pnl")}>
                Total {sortArrow("pnl", sort, sortDir)}
              </th>
              <th className="pnl-th-sort" onClick={() => sortBy("return")}>
                Return {sortArrow("return", sort, sortDir)}
              </th>
            </tr>
          </thead>
          <tbody>
              {pageRows.map((p) => (
                <tr
                  key={p.key}
                  className={selectedKey === p.key ? "pnl-row-selected" : ""}
                  onClick={() => onSelect(p.key)}
                >
                  <td>
                    <div className="intel-symbol">{p.symbol}</div>
                    <div className="muted">
                      {p.displayName || "—"}
                      {p.aliases.length ? ` · was ${p.aliases.join(", ")}` : ""}
                    </div>
                    <div className="muted">
                      {p.buyCount} buy{p.buyCount === 1 ? "" : "s"}
                      {p.sellCount ? ` · ${p.sellCount} sell${p.sellCount === 1 ? "" : "s"}` : ""}
                      {p.holdDays != null ? ` · ${p.holdDays}d` : ""}
                    </div>
                  </td>
                  <td>
                    <span className={`pnl-status pnl-status-${p.status}`}>{p.status}</span>
                    {p.status === "open" && p.quantityHeld > 0 ? (
                      <div className="muted tabular">{p.quantityHeld.toFixed(2)} sh</div>
                    ) : null}
                  </td>
                  <td className="tabular">{money(p.invested, p.currency)}</td>
                  <td className="tabular">{money(p.proceeds, p.currency)}</td>
                  <td className="tabular">{p.dividends ? money(p.dividends, p.currency) : "—"}</td>
                  <td className={`tabular ${pnlClass(p.realizedPnl)}`}>
                    {money(p.realizedPnl, p.currency)}
                  </td>
                  <td className={`tabular ${pnlClass(p.unrealizedPnl)}`}>
                    {p.status === "closed" ? "—" : money(p.unrealizedPnl, p.currency)}
                  </td>
                  <td className={`tabular ${pnlClass(p.totalPnl)}`}>
                    {money(p.totalPnl, p.currency)}
                  </td>
                  <td className={`tabular ${pnlClass(p.returnPct)}`}>
                    {p.returnPct == null
                      ? "—"
                      : `${p.returnPct > 0 ? "+" : ""}${p.returnPct.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
              {!pageRows.length ? (
                <tr>
                  <td colSpan={9} className="muted">
                    Nothing matches this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <Pagination
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            total={rows.length}
            setPage={setPage}
            setPageSize={setPageSize}
          />
        </div>

      <Drawer
        open={!!selected}
        title={
          selected
            ? `${selected.symbol}${selected.displayName ? ` · ${selected.displayName}` : ""}`
            : "Position"
        }
        onClose={onCloseDetail}
        size="wide"
      >
        {selected ? <PositionDetail position={selected} /> : null}
      </Drawer>
    </>
  );
}

function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  setPage,
  setPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  setPage: (p: number) => void;
  setPageSize: (n: number) => void;
}) {
  if (total === 0) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="pnl-pagination">
      <div className="muted">
        {from}–{to} of {total}
      </div>
      <div className="pnl-pagination-controls">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          ‹ Prev
        </button>
        <span className="tabular muted">
          {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={page >= pageCount - 1}
          onClick={() => setPage(page + 1)}
        >
          Next ›
        </button>
      </div>
      <label className="muted">
        Rows{" "}
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function PositionDetail({ position }: { position: SymbolPerformance }) {
  const trades = [...position.trades].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="pnl-detail">
      {position.aliases.length ? (
        <p className="muted" style={{ marginTop: 0 }}>
          Formerly {position.aliases.join(", ")}
        </p>
      ) : null}

      <div className="pnl-detail-grid">
        <DetailStat label="Total P&L" value={money(position.totalPnl, position.currency)} cls={pnlClass(position.totalPnl)} />
        <DetailStat label="Return" value={position.returnPct == null ? "—" : `${position.returnPct > 0 ? "+" : ""}${position.returnPct.toFixed(1)}%`} cls={pnlClass(position.returnPct)} />
        <DetailStat label="Avg buy price" value={money(position.averageBuyPrice, position.currency)} />
        <DetailStat label="Avg sell price" value={money(position.averageSellPrice, position.currency)} />
        <DetailStat label="Invested" value={money(position.invested, position.currency)} />
        <DetailStat label="Proceeds" value={money(position.proceeds, position.currency)} />
        <DetailStat label="Realized" value={money(position.realizedPnl, position.currency)} cls={pnlClass(position.realizedPnl)} />
        <DetailStat label="Dividends" value={money(position.dividends, position.currency)} />
        <DetailStat label="FX / stamp" value={money(position.fees, position.currency)} />
        <DetailStat label="First bought" value={formatDate(position.firstBoughtAt)} />
        <DetailStat label="Last activity" value={formatDate(position.lastActivityAt)} />
      </div>

      {position.price != null ? (
        <div className="pnl-detail-mark">
          <span className="muted">Live mark</span>
          <span className="tabular">
            {position.price.toFixed(2)} {position.priceCurrency || ""}
          </span>
          {position.marketValue != null ? (
            <span className="muted">
              · market value {money(position.marketValue, position.currency)}
            </span>
          ) : null}
        </div>
      ) : null}

      {position.sellCount > 0 ? <WhatIfPanel positionKey={position.key} /> : null}

      <div className="pnl-detail-trades-title">Trade sheet</div>
      <div className="intel-table-wrap pnl-detail-trades">
        <table className="intel-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => (
              <TradeRow key={`${t.date}-${i}`} trade={t} currency={position.currency} />
            ))}
            {!trades.length ? (
              <tr>
                <td colSpan={5} className="muted">No trades recorded.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TradeRow({ trade, currency }: { trade: PositionTrade; currency: string }) {
  return (
    <tr>
      <td className="muted tabular">{formatDate(trade.date)}</td>
      <td>
        <span className={`pnl-trade-type pnl-trade-${trade.type}`}>{trade.type}</span>
        {trade.note ? <div className="muted">{trade.note}</div> : null}
      </td>
      <td className="tabular">{trade.quantity != null ? trade.quantity.toFixed(4) : "—"}</td>
      <td className="tabular">{money(trade.price, currency)}</td>
      <td className="tabular">{money(trade.total, currency)}</td>
    </tr>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="tabular">{value}</div>
    </div>
  );
}

function DetailStat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="pnl-detail-stat">
      <div className="stat-label">{label}</div>
      <div className={`tabular ${cls ?? ""}`}>{value}</div>
    </div>
  );
}

function InsightNote({ insight }: { insight: PortfolioInsight }) {
  return (
    <div className={`pnl-note pnl-insight-${insight.tone}`}>
      <div className="pnl-insight-title">{insight.title}</div>
      <div className="muted">{insight.detail}</div>
    </div>
  );
}

function pct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function MarketCompareBody({ comparison }: { comparison: MarketCompareResult }) {
  const { overall, years } = comparison;
  return (
    <>
      <p className="muted" style={{ marginTop: 0 }}>
        Since {formatDate(comparison.firstInvestedAt)} · {overall.years} calendar year
        {overall.years === 1 ? "" : "s"}
      </p>

      <div className="pnl-detail-grid" style={{ marginBottom: "1rem" }}>
        <DetailStat label="You (all-time)" value={pct(overall.youPct)} cls={pnlClass(overall.youPct)} />
        <DetailStat label="S&P 500" value={pct(overall.sp500Pct)} cls={pnlClass(overall.sp500Pct)} />
        <DetailStat label="FTSE 100" value={pct(overall.ftse100Pct)} cls={pnlClass(overall.ftse100Pct)} />
        <DetailStat
          label="Your P&L"
          value={money(overall.youPnl, comparison.currency)}
          cls={pnlClass(overall.youPnl)}
        />
      </div>

      <YearCompareChart years={years} />

      <div className="pnl-detail-trades-title" style={{ marginTop: "1rem" }}>
        Year by year
      </div>
      <div className="intel-table-wrap pnl-detail-trades">
        <table className="intel-table pnl-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>You</th>
              <th>S&amp;P 500</th>
              <th>FTSE 100</th>
              <th>vs S&amp;P</th>
              <th>vs FTSE</th>
              <th>Your P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {[...years].reverse().map((y) => (
              <tr key={y.year}>
                <td className="tabular">
                  {y.year}
                  {y.partial ? <span className="muted"> · part</span> : null}
                </td>
                <td className={`tabular ${pnlClass(y.youPct)}`}>{pct(y.youPct)}</td>
                <td className={`tabular ${pnlClass(y.sp500Pct)}`}>{pct(y.sp500Pct)}</td>
                <td className={`tabular ${pnlClass(y.ftse100Pct)}`}>{pct(y.ftse100Pct)}</td>
                <td className={`tabular ${pnlClass(y.vsSp500Pct)}`}>{pct(y.vsSp500Pct)}</td>
                <td className={`tabular ${pnlClass(y.vsFtse100Pct)}`}>{pct(y.vsFtse100Pct)}</td>
                <td className={`tabular ${pnlClass(y.youPnl)}`}>
                  {money(y.youPnl, comparison.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ marginTop: "0.85rem", fontSize: "0.82rem" }}>
        {comparison.note}
      </p>
    </>
  );
}
