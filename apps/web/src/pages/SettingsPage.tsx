import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  fetchAlertEvents,
  fetchAlerts,
  fetchChannels,
  deleteAlert,
  updateAlert,
  deleteChannel,
  updateChannel,
  fetchPortfolioHealth,
  fetchFreetrade,
  importFreetradeCsv,
  disconnectFreetrade,
} from "../lib/queries";
import { formatDateTime } from "../lib/dates";
import type {
  AlertEvent,
  AlertRule,
  NotificationChannel,
  PortfolioHealth,
  PortfolioHolding,
} from "@trader/shared";

function fmtRuleKind(kind: string, threshold: number, enabled: boolean) {
  const pct = kind.startsWith("pct_") ? "%" : "";
  return `${kind} ${threshold}${pct}${enabled ? "" : " · off"}`;
}

function fmtNum(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

function FreetradeSection() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [syncWatchlist, setSyncWatchlist] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const freetrade = useQuery({
    queryKey: ["freetrade"],
    queryFn: fetchFreetrade,
  });

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const csv = await file.text();
      return importFreetradeCsv(csv, syncWatchlist);
    },
    onSuccess: () => {
      setLocalError(null);
      qc.invalidateQueries({ queryKey: ["freetrade"] });
      qc.invalidateQueries({ queryKey: ["portfolio-health"] });
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      qc.invalidateQueries({ queryKey: ["intelligence"] });
      qc.invalidateQueries({ queryKey: ["portfolio-performance"] });
    },
    onError: (err) => setLocalError((err as Error).message),
  });

  const disconnectMut = useMutation({
    mutationFn: disconnectFreetrade,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["freetrade"] });
      qc.invalidateQueries({ queryKey: ["portfolio-health"] });
      qc.invalidateQueries({ queryKey: ["portfolio-performance"] });
    },
  });

  const connection = freetrade.data?.connection;
  const holdings = freetrade.data?.holdings ?? [];

  return (
    <div style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1.05rem", marginBottom: "0.35rem" }}>Freetrade</h2>
      <p className="muted" style={{ marginBottom: "0.85rem" }}>
        Freetrade has no public API. Export Activity CSV from the Freetrade app
        (Settings → Activity → export), then import it here. Holdings feed Portfolio
        Health; full profit/loss lives on the{" "}
        <Link to="/portfolio">Paper</Link> page.
      </p>

      <div className="card" style={{ marginBottom: "0.85rem" }}>
        <div className="card-row">
          <div>
            {connection ? (
              <>
                <div style={{ fontWeight: 600 }}>Connected · Freetrade CSV</div>
                <div className="muted">
                  {connection.holdingCount} holdings · {connection.transactionCount}{" "}
                  activity rows
                  {connection.lastSyncedAt
                    ? ` · last import ${formatDateTime(connection.lastSyncedAt)}`
                    : ""}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 600 }}>Not connected</div>
                <div className="muted">Upload a Freetrade activity export to get started.</div>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={importMut.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {importMut.isPending ? "Importing…" : connection ? "Re-import CSV" : "Import CSV"}
            </button>
            {connection ? (
              <button
                type="button"
                className="btn btn-danger"
                disabled={disconnectMut.isPending}
                onClick={() => disconnectMut.mutate()}
              >
                Disconnect
              </button>
            ) : null}
          </div>
        </div>

        <label
          className="muted"
          style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.85rem" }}
        >
          <input
            type="checkbox"
            checked={syncWatchlist}
            onChange={(e) => setSyncWatchlist(e.target.checked)}
          />
          Also add holdings to my watchlist
        </label>

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

        {(localError || importMut.isError) && (
          <div className="form-error" style={{ marginTop: "0.75rem" }}>
            {localError || (importMut.error as Error).message}
          </div>
        )}
        {importMut.isSuccess ? (
          <div className="muted" style={{ marginTop: "0.75rem" }}>
            Imported {importMut.data.holdingCount} holdings from{" "}
            {importMut.data.transactionCount} rows
            {importMut.data.watchlistSynced.length
              ? ` · added ${importMut.data.watchlistSynced.length} to watchlist`
              : ""}
            . Open <Link to="/portfolio">Paper</Link> for P&amp;L.
          </div>
        ) : null}
      </div>

      {holdings.length > 0 ? (
        <div className="intel-table-wrap">
          <table className="intel-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Qty</th>
                <th>Avg cost</th>
                <th>Cost basis</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h: PortfolioHolding) => (
                <tr key={h.symbol}>
                  <td>
                    <div className="intel-symbol">{h.symbol}</div>
                    {h.displayName ? <div className="muted">{h.displayName}</div> : null}
                  </td>
                  <td className="tabular">{fmtNum(h.quantity, 4)}</td>
                  <td className="tabular">
                    {fmtNum(h.averageCost)} {h.currency}
                  </td>
                  <td className="tabular">
                    {fmtNum(h.costBasis)} {h.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function PortfolioHealthSection({ data }: { data: PortfolioHealth }) {
  return (
    <div className="hunt-portfolio-panel" style={{ marginBottom: "2rem" }}>
      <div className="stats-grid">
        <div className="stat">
          <div className="stat-label">Health score</div>
          <div className="stat-value tabular">{data.healthScore}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Symbols</div>
          <div className="stat-value tabular">{data.symbolCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Avg opportunity</div>
          <div className="stat-value tabular">{data.averageOpportunityScore ?? "—"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Avg risk</div>
          <div className="stat-value tabular">{data.averageRiskScore ?? "—"}</div>
        </div>
      </div>
      <p className="muted" style={{ marginTop: "0.75rem" }}>
        Source: {data.holdingsProxy === "freetrade" ? "Freetrade holdings" : "Watchlist proxy"} ·{" "}
        {data.note}
      </p>
      {data.concentration.warning ? (
        <p className="muted">{data.concentration.warning}</p>
      ) : null}
      <div className="hunt-portfolio-cols">
        <div>
          <h3>Strongest</h3>
          {data.strongest.map((s) => (
            <div key={s.symbol} className="muted">
              <span className="intel-symbol">{s.symbol}</span> · {s.opportunityScore} — {s.reason}
            </div>
          ))}
          {!data.strongest.length ? <div className="muted">—</div> : null}
        </div>
        <div>
          <h3>Weakest</h3>
          {data.weakest.map((s) => (
            <div key={s.symbol} className="muted">
              <span className="intel-symbol">{s.symbol}</span> · {s.opportunityScore} — {s.reason}
            </div>
          ))}
          {!data.weakest.length ? <div className="muted">—</div> : null}
        </div>
      </div>
      <div className="muted" style={{ marginTop: "0.75rem" }}>
        Improving: {data.improving.join(", ") || "—"} · Deteriorating:{" "}
        {data.deteriorating.join(", ") || "—"}
      </div>
    </div>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();

  const alerts = useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts });
  const events = useQuery({ queryKey: ["alert-events"], queryFn: fetchAlertEvents });
  const channels = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });
  const portfolio = useQuery({
    queryKey: ["portfolio-health"],
    queryFn: fetchPortfolioHealth,
    staleTime: 5 * 60_000,
  });

  const updateAlertMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateAlert(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const deleteAlertMut = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts", "alert-events"] }),
  });

  const updateChannelMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateChannel(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });

  const deleteChannelMut = useMutation({
    mutationFn: deleteChannel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });

  return (
    <div className="page page-wide">
      <h1>Settings</h1>
      <p className="page-lead">
        Manage brokers, portfolio health, alerts, and notification channels. Add/edit per-stock
        channels and alerts from the stock drawer on the right.
      </p>

      <FreetradeSection />

      <h2 style={{ fontSize: "1.05rem", marginBottom: "0.75rem" }}>Portfolio health</h2>
      {portfolio.isLoading ? (
        <div className="muted" style={{ marginBottom: "2rem" }}>
          Scoring portfolio…
        </div>
      ) : portfolio.data ? (
        <PortfolioHealthSection data={portfolio.data} />
      ) : portfolio.isError ? (
        <div className="form-error" style={{ marginBottom: "2rem" }}>
          {(portfolio.error as Error).message}
        </div>
      ) : null}

      <h2 style={{ fontSize: "1.05rem", marginBottom: "0.75rem" }}>Global alerts</h2>
      <div className="card-list" style={{ marginBottom: "2rem" }}>
        {(alerts.data as AlertRule[] | undefined)?.map((rule) => (
          <div className="card" key={rule.id}>
            <div className="card-row">
              <div>
                <div style={{ fontWeight: 600, fontFamily: "var(--mono)" }}>
                  {rule.symbol} · {fmtRuleKind(rule.kind, rule.threshold, rule.enabled)}
                </div>
                <div className="muted">
                  baseline {rule.baseline}
                  {rule.baselineWindowDays ? ` (${rule.baselineWindowDays}d)` : ""} · cooldown{" "}
                  {rule.cooldownMinutes}m · {rule.channelIds.length} channel(s)
                  {rule.lastTriggeredAt
                    ? ` · last fired ${new Date(rule.lastTriggeredAt).toLocaleString()}`
                    : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    updateAlertMut.mutate({ id: rule.id, enabled: !rule.enabled })
                  }
                >
                  {rule.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => deleteAlertMut.mutate(rule.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {!alerts.data?.length && <div className="muted">No alerts yet.</div>}
      </div>

      <h2 style={{ fontSize: "1.05rem", marginBottom: "0.75rem" }}>Recent alert events</h2>
      <div className="card-list" style={{ marginBottom: "2rem" }}>
        {(events.data as AlertEvent[] | undefined)?.map((ev) => (
          <div className="card" key={ev.id}>
            <div style={{ fontFamily: "var(--mono)", fontWeight: 500 }}>
              {ev.symbol} @ {ev.price}
            </div>
            <div className="muted">
              {ev.message} · {ev.status} · {new Date(ev.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
        {!events.data?.length && <div className="muted">No alerts have fired yet.</div>}
      </div>

      <h2 style={{ fontSize: "1.05rem", marginBottom: "0.75rem" }}>Global channels</h2>
      <div className="card-list">
        {(channels.data as NotificationChannel[] | undefined)?.map((ch) => (
          <div className="card" key={ch.id}>
            <div className="card-row">
              <div>
                <div style={{ fontWeight: 600 }}>
                  {ch.symbol ? (
                    <span style={{ fontFamily: "var(--mono)" }}>{ch.symbol}</span>
                  ) : (
                    <span className="muted">Unassigned</span>
                  )}{" "}
                  · {ch.label}
                </div>
                <div className="muted">
                  <span className={`badge ${ch.enabled ? "badge-on" : ""}`}>{ch.type}</span>{" "}
                  {ch.type === "email" && String(ch.config.address || "")}
                  {ch.type === "telegram" && `chat ${String(ch.config.chatId || "")}`}
                  {ch.type === "twist" &&
                    `thread ${String(ch.config.conversationId || ch.config.threadId || "")}`}
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    updateChannelMut.mutate({ id: ch.id, enabled: !ch.enabled })
                  }
                >
                  {ch.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => deleteChannelMut.mutate(ch.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
        {!channels.data?.length && !channels.isLoading && (
          <div className="muted">No channels yet.</div>
        )}
      </div>
    </div>
  );
}
