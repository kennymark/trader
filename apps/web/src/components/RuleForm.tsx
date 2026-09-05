import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import type { AlertBaseline, AlertKind, AlertScope } from "@trader/shared";
import { createAlert, fetchChannels } from "../lib/queries";
import { usePreferences } from "../lib/preferences";

type Props = {
  scope: AlertScope;
  /** Only used when the scope is a single stock. */
  symbol?: string | null;
  /** Supplied by surfaces that let you choose what the rule watches. */
  onScopeChange?: (scope: AlertScope) => void;
  submitLabel?: string;
};

const SCOPE_OPTIONS: Array<{ id: AlertScope; label: string }> = [
  { id: "watchlist", label: "Every stock on my watchlist" },
  { id: "holdings", label: "Every stock I hold" },
];

/**
 * One form for every kind of rule. A rule watching many names can only be
 * expressed as a move — "below 30" says something different about every
 * ticker — so the price-level kinds are offered for a single stock only.
 */
export function RuleForm({ scope, symbol, onScopeChange, submitLabel }: Props) {
  const qc = useQueryClient();
  const { prefs } = usePreferences();

  const [kind, setKind] = useState<AlertKind>("pct_drop");
  const [threshold, setThreshold] = useState(10);
  const [baseline, setBaseline] = useState<AlertBaseline>(prefs.alertDefaultBaseline);
  const [baselineWindowDays, setBaselineWindowDays] = useState(prefs.alertDefaultWindowDays);
  const [cooldownMinutes, setCooldownMinutes] = useState(prefs.alertDefaultCooldownMinutes);
  // null means "not touched", which stands for every enabled destination, so a
  // new rule sends everywhere unless you deliberately narrow it.
  const [channelIds, setChannelIds] = useState<string[] | null>(null);

  const channels = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });
  const enabledChannels = (channels.data ?? []).filter((c) => c.enabled);
  const selectedChannelIds = channelIds ?? enabledChannels.map((c) => c.id);

  const singleStock = scope === "symbol";
  const isPercent = kind === "pct_drop" || kind === "pct_rise";

  const createMut = useMutation({
    mutationFn: createAlert,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      setChannelIds(null);
    },
  });

  function toggleChannel(id: string) {
    setChannelIds(
      selectedChannelIds.includes(id)
        ? selectedChannelIds.filter((x) => x !== id)
        : [...selectedChannelIds, id],
    );
  }

  function setKindSafely(next: AlertKind) {
    setKind(next);
  }

  return (
    <>
      <div className="form-grid">
        {onScopeChange ? (
          <div className="field">
            <label htmlFor="rule-scope">Watch</label>
            <select
              id="rule-scope"
              value={scope}
              onChange={(e) => onScopeChange(e.target.value as AlertScope)}
            >
              {SCOPE_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="rule-kind">Kind</label>
          <select
            id="rule-kind"
            value={kind}
            onChange={(e) => setKindSafely(e.target.value as AlertKind)}
          >
            {singleStock ? <option value="below">Price below</option> : null}
            {singleStock ? <option value="above">Price above</option> : null}
            <option value="pct_drop">% drop</option>
            <option value="pct_rise">% rise</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="rule-threshold">Threshold</label>
          <input
            id="rule-threshold"
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </div>

        {isPercent ? (
          <>
            <div className="field">
              <label htmlFor="rule-baseline">Baseline</label>
              <select
                id="rule-baseline"
                value={baseline}
                onChange={(e) => setBaseline(e.target.value as AlertBaseline)}
              >
                <option value="prev_close">Previous close</option>
                <option value="n_day_high">N-day high</option>
              </select>
            </div>
            {baseline === "n_day_high" ? (
              <div className="field">
                <label htmlFor="rule-window">Window (days)</label>
                <input
                  id="rule-window"
                  type="number"
                  value={baselineWindowDays}
                  onChange={(e) => setBaselineWindowDays(Number(e.target.value))}
                />
              </div>
            ) : null}
          </>
        ) : null}

        <div className="field">
          <label htmlFor="rule-cooldown">Cooldown (minutes)</label>
          <input
            id="rule-cooldown"
            type="number"
            value={cooldownMinutes}
            onChange={(e) => setCooldownMinutes(Number(e.target.value))}
          />
        </div>
      </div>

      {!singleStock ? (
        <p className="muted rule-form-note">
          The quiet period is kept per stock, so one name moving doesn’t silence the rest.
        </p>
      ) : null}

      <div className="rule-form-destinations">
        <div className="stat-label">Deliver to</div>
        <div className="rule-form-destination-list">
          <span className="btn rule-form-destination rule-form-destination-fixed">
            <input type="checkbox" checked disabled readOnly />
            In this app
          </span>
          {enabledChannels.map((c) => (
            <label key={c.id} className="btn rule-form-destination">
              <input
                type="checkbox"
                checked={selectedChannelIds.includes(c.id)}
                onChange={() => toggleChannel(c.id)}
              />
              {c.label}
            </label>
          ))}
          {!enabledChannels.length ? (
            <span className="muted">
              Firings land in the bell. To be reached elsewhere, add a destination in{" "}
              <Link to="/settings">Settings</Link> — it is shared by every rule.
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary"
        disabled={createMut.isPending}
        onClick={() =>
          createMut.mutate({
            scope,
            symbol: singleStock ? symbol ?? undefined : undefined,
            kind,
            threshold,
            baseline: isPercent ? baseline : "absolute",
            baselineWindowDays: baseline === "n_day_high" ? baselineWindowDays : undefined,
            channelIds: selectedChannelIds,
            cooldownMinutes,
          })
        }
      >
        {submitLabel ?? "Create alert"}
      </button>

      {createMut.isError ? (
        <div className="form-error rule-form-error">{(createMut.error as Error).message}</div>
      ) : null}
    </>
  );
}
