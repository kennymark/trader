import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AlertBaseline, AlertKind } from "@trader/shared";
import {
  createAlert,
  deleteAlert,
  fetchAlertEvents,
  fetchAlerts,
  fetchChannels,
  fetchWatchlist,
  updateAlert,
} from "../lib/queries";

export function AlertsPage() {
  const qc = useQueryClient();
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts });
  const events = useQuery({ queryKey: ["alert-events"], queryFn: fetchAlertEvents });
  const channels = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });
  const watchlist = useQuery({ queryKey: ["watchlist"], queryFn: fetchWatchlist });

  const [symbol, setSymbol] = useState("");
  const [kind, setKind] = useState<AlertKind>("pct_drop");
  const [threshold, setThreshold] = useState(10);
  const [baseline, setBaseline] = useState<AlertBaseline>("prev_close");
  const [baselineWindowDays, setBaselineWindowDays] = useState(20);
  const [cooldownMinutes, setCooldownMinutes] = useState(60);
  const [channelIds, setChannelIds] = useState<string[]>([]);

  const createMut = useMutation({
    mutationFn: createAlert,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      setChannelIds([]);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => updateAlert(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const toggleChannel = (id: string) => {
    setChannelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="page">
      <h1>Price alerts</h1>
      <p className="page-lead">
        Get notified when a stock crosses a price or drops by a percentage — ideal for
        buying big-cap dips.
      </p>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>New alert</h2>
        <div className="form-grid">
          <div className="field">
            <label>Symbol</label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              <option value="">Select…</option>
              {(watchlist.data || []).map((w) => (
                <option key={w.id} value={w.symbol}>
                  {w.symbol}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Kind</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as AlertKind)}>
              <option value="below">Price below</option>
              <option value="above">Price above</option>
              <option value="pct_drop">% drop</option>
              <option value="pct_rise">% rise</option>
            </select>
          </div>
          <div className="field">
            <label>Threshold</label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </div>
          {(kind === "pct_drop" || kind === "pct_rise") && (
            <>
              <div className="field">
                <label>Baseline</label>
                <select
                  value={baseline}
                  onChange={(e) => setBaseline(e.target.value as AlertBaseline)}
                >
                  <option value="prev_close">Previous close</option>
                  <option value="n_day_high">N-day high</option>
                </select>
              </div>
              {baseline === "n_day_high" && (
                <div className="field">
                  <label>Window (days)</label>
                  <input
                    type="number"
                    value={baselineWindowDays}
                    onChange={(e) => setBaselineWindowDays(Number(e.target.value))}
                  />
                </div>
              )}
            </>
          )}
          <div className="field">
            <label>Cooldown (minutes)</label>
            <input
              type="number"
              value={cooldownMinutes}
              onChange={(e) => setCooldownMinutes(Number(e.target.value))}
            />
          </div>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <div className="stat-label" style={{ marginBottom: "0.5rem" }}>
            Channels
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {(channels.data || []).filter((c) => c.enabled).map((c) => (
              <label key={c.id} className="btn" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={channelIds.includes(c.id)}
                  onChange={() => toggleChannel(c.id)}
                  style={{ marginRight: "0.4rem" }}
                />
                {c.label} ({c.type})
              </label>
            ))}
            {!channels.data?.filter((c) => c.enabled).length && (
              <span className="muted">Add a channel in Settings first.</span>
            )}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={!symbol || channelIds.length === 0 || createMut.isPending}
          onClick={() =>
            createMut.mutate({
              symbol,
              kind,
              threshold,
              baseline: kind.startsWith("pct_") ? baseline : "absolute",
              baselineWindowDays: baseline === "n_day_high" ? baselineWindowDays : undefined,
              channelIds,
              cooldownMinutes,
            })
          }
        >
          Create alert
        </button>
        {createMut.isError && (
          <div className="error-banner" style={{ marginTop: "0.75rem" }}>
            {(createMut.error as Error).message}
          </div>
        )}
      </section>

      <h2 style={{ fontSize: "1.05rem" }}>Active rules</h2>
      <div className="card-list" style={{ marginBottom: "2rem" }}>
        {(alerts.data || []).map((rule) => (
          <div className="card" key={rule.id}>
            <div className="card-row">
              <div>
                <div style={{ fontWeight: 600, fontFamily: "var(--mono)" }}>
                  {rule.symbol} · {rule.kind} {rule.threshold}
                  {rule.kind.startsWith("pct_") ? "%" : ""}
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
                    updateMut.mutate({ id: rule.id, body: { enabled: !rule.enabled } })
                  }
                >
                  {rule.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => deleteMut.mutate(rule.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {!alerts.data?.length && <div className="muted">No alerts yet.</div>}
      </div>

      <h2 style={{ fontSize: "1.05rem" }}>Recent events</h2>
      <div className="card-list">
        {(events.data || []).map((ev) => (
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
    </div>
  );
}
