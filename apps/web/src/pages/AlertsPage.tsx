import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { SymbolAlerts } from "../components/SymbolAlerts";
import {
  deleteAlert,
  fetchAlertEvents,
  fetchAlerts,
  updateAlert,
} from "../lib/queries";
import { readSelectedSymbol } from "../lib/selectedSymbol";

export function AlertsPage() {
  const qc = useQueryClient();
  const [selected] = useState(() => readSelectedSymbol());
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts });
  const events = useQuery({ queryKey: ["alert-events"], queryFn: fetchAlertEvents });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => updateAlert(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  return (
    <div className="page">
      <h1>Price alerts</h1>
      <p className="page-lead">
        Overview of all alert rules. Create and manage alerts for a stock from its detail
        pane on the watchlist.
      </p>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        {selected ? (
          <SymbolAlerts symbol={selected} />
        ) : (
          <div className="empty-state" style={{ padding: "2rem 1rem", height: "auto" }}>
            <strong>Select a stock</strong>
            <span>
              Open the{" "}
              <Link to="/" style={{ color: "var(--accent)" }}>
                watchlist
              </Link>{" "}
              and pick a symbol to create alerts for that stock.
            </span>
          </div>
        )}
      </section>

      <h2 style={{ fontSize: "1.05rem" }}>All rules</h2>
      <div className="card-list" style={{ marginBottom: "2rem" }}>
        {(alerts.data || []).map((rule) => (
          <div className="card" key={rule.id}>
            <div className="card-row">
              <div>
                <div style={{ fontWeight: 600, fontFamily: "var(--mono)" }}>
                  {rule.symbol} · {rule.kind} {rule.threshold}
                  {rule.kind.startsWith("pct_") ? "%" : ""}
                  {!rule.enabled ? " · off" : ""}
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
