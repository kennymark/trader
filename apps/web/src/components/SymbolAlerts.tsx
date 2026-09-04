import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AlertBaseline, AlertKind } from "@trader/shared";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";
import { channelMatchesSymbol } from "../lib/channelSymbol";
import { describeRule, describeRuleDetail } from "../lib/alertText";
import { usePreferences } from "../lib/preferences";
import {
  createAlert,
  deleteAlert,
  fetchAlerts,
  fetchChannels,
  updateAlert,
} from "../lib/queries";

type Props = {
  symbol: string;
  /** Compact layout for embedding under the chart pane. */
  embedded?: boolean;
};

export function SymbolAlerts({ symbol, embedded = false }: Props) {
  const qc = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthed = !AUTH_ENABLED || Boolean(session?.user);

  const [kind, setKind] = useState<AlertKind>("pct_drop");
  const [threshold, setThreshold] = useState(10);
  const { prefs } = usePreferences();
  const [baseline, setBaseline] = useState<AlertBaseline>(prefs.alertDefaultBaseline);
  const [baselineWindowDays, setBaselineWindowDays] = useState(prefs.alertDefaultWindowDays);
  const [cooldownMinutes, setCooldownMinutes] = useState(prefs.alertDefaultCooldownMinutes);
  const [channelIds, setChannelIds] = useState<string[]>([]);

  const alerts = useQuery({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
    enabled: isAuthed && !sessionPending,
  });
  const channels = useQuery({
    queryKey: ["channels"],
    queryFn: fetchChannels,
    enabled: isAuthed && !sessionPending,
  });

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

  const symbolRules = (alerts.data || []).filter(
    (r) => r.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  const enabledChannels = (channels.data || []).filter(
    (c) => c.enabled && channelMatchesSymbol(c.symbol, symbol),
  );

  return (
    <section className={embedded ? "symbol-alerts" : undefined}>

      <div className="form-grid">
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
          Deliver to
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {enabledChannels.map((c) => (
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
          {!enabledChannels.length && (
            <span className="muted">
              No delivery set up for {symbol} yet — add one under Delivery below, then a rule
              has somewhere to send.
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        disabled={channelIds.length === 0 || createMut.isPending}
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
        <div className="error-banner" style={{ marginTop: "0.75rem", marginLeft: 0, marginRight: 0 }}>
          {(createMut.error as Error).message}
        </div>
      )}

      <h3 className="symbol-alerts-subtitle">Active rules</h3>
      <div className="card-list">
        {symbolRules.map((rule) => (
          <div className="card" key={rule.id}>
            <div className="card-row">
              <div>
                <div style={{ fontWeight: 600 }}>
                  {describeRule(rule)}
                  {!rule.enabled ? " · off" : ""}
                </div>
                <div className="muted">
                  {describeRuleDetail(rule)}
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
        {!alerts.isLoading && !symbolRules.length && (
          <div className="muted">No alerts for {symbol} yet.</div>
        )}
      </div>
    </section>
  );
}
