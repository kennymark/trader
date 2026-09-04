import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchAlertEvents,
  fetchAlerts,
  fetchChannels,
  deleteAlert,
  updateAlert,
  deleteChannel,
  updateChannel,
  fetchFreetrade,
  fetchWatchlist,
  importFreetradeCsv,
  disconnectFreetrade,
} from "../lib/queries";
import { SymbolChannels } from "../components/SymbolChannels";
import { formatDateTime } from "../lib/dates";
import { describeRule, describeRuleDetail } from "../lib/alertText";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";
import { usePreferences, useResetPreferences, useSavePreferences } from "../lib/preferences";
import { clearChat, fetchChatStatus } from "../lib/queries";
import type {
  AlertBaseline,
  AlertEvent,
  AlertRule,
  HistoryRange,
  NotificationChannel,
  PortfolioHolding,
  UserPreferences,
  WorkTab,
} from "@trader/shared";
import { QUOTE_REFRESH_CHOICES } from "@trader/shared";

const SECTIONS = [
  ["account", "Account"],
  ["display", "Display"],
  ["alerts", "Notifications"],
  ["intelligence", "Intelligence"],
  ["data", "Data"],
] as const;

const CHART_RANGES: Array<[HistoryRange, string]> = [
  ["1d", "1 day"],
  ["7d", "7 days"],
  ["1m", "1 month"],
  ["3m", "3 months"],
  ["1y", "1 year"],
  ["5y", "5 years"],
  ["max", "Max"],
];

const WORK_TABS: Array<[WorkTab, string]> = [
  ["chart", "Chart"],
  ["intelligence", "Intelligence"],
  ["feed", "Feed"],
  ["record", "Track record"],
];

const BASELINES: Array<[AlertBaseline, string]> = [
  ["prev_close", "Previous close"],
  ["n_day_high", "N-day high"],
  ["absolute", "Absolute price"],
];

function refreshLabel(seconds: number): string {
  if (seconds === 0) return "Off";
  if (seconds < 60) return `${seconds}s`;
  return `${seconds / 60}m`;
}

/** One labelled control. The hint says what the setting changes, not what it is. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting">
      <div className="setting-text">
        <div className="setting-label">{label}</div>
        {hint ? <p className="setting-hint">{hint}</p> : null}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

/** A row of mutually exclusive values, used wherever the choices are few. */
function Choice<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="setting-choice" role="group">
      {options.map(([id, label]) => (
        <button
          key={String(id)}
          type="button"
          className={id === value ? "active" : ""}
          aria-pressed={id === value}
          disabled={disabled}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
  labelOn = "On",
  labelOff = "Off",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  labelOn?: string;
  labelOff?: string;
}) {
  return (
    <Choice<"on" | "off">
      value={checked ? "on" : "off"}
      options={[
        ["on", labelOn],
        ["off", labelOff],
      ]}
      onChange={(next) => onChange(next === "on")}
      disabled={disabled}
    />
  );
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
    <div>
      <h3 className="settings-sub">Freetrade</h3>
      <p className="muted" style={{ marginBottom: "0.85rem" }}>
        Freetrade has no public API. Export Activity CSV from the Freetrade app
        (Settings → Activity → export), then import it here. Holdings feed Portfolio
        Health; full profit/loss lives on the{" "}
        <Link to="/portfolio">Portfolio</Link> page.
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
            . Open <Link to="/portfolio">Portfolio</Link> for P&amp;L.
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

function SettingsNav() {
  const [active, setActive] = useState<string>(SECTIONS[0][0]);

  // Highlights whichever section is nearest the top of the reading area, so
  // the index reports position rather than only offering links.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );
    for (const [id] of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="settings-nav" aria-label="Settings sections">
      {SECTIONS.map(([id, label]) => (
        <a key={id} href={`#${id}`} className={active === id ? "active" : ""}>
          {label}
        </a>
      ))}
    </nav>
  );
}

function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="settings-section">
      <header className="settings-section-head">
        <h2>{title}</h2>
        {lead ? <p className="muted">{lead}</p> : null}
      </header>
      {children}
    </section>
  );
}

function AccountSection() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  if (!AUTH_ENABLED) {
    return (
      <p className="muted">
        Auth is switched off in this build, so the app runs as a single local user.
      </p>
    );
  }

  return (
    <>
      <Field label="Signed in as">
        <div className="setting-static">
          <div>{user?.name || "—"}</div>
          <div className="muted">{user?.email || "—"}</div>
        </div>
      </Field>
      <Field label="Session" hint="Signs you out on this device only.">
        <button type="button" className="btn" onClick={() => authClient.signOut()}>
          Sign out
        </button>
      </Field>
    </>
  );
}

function DisplaySection() {
  const { prefs } = usePreferences();
  const save = useSavePreferences();
  const reset = useResetPreferences();
  const busy = save.isPending || reset.isPending;

  const set = (patch: Partial<UserPreferences>) => save.mutate(patch);

  return (
    <>
      <Field
        label="Default chart range"
        hint="The span a stock opens on before you pick another."
      >
        <Choice
          value={prefs.defaultChartRange}
          options={CHART_RANGES}
          disabled={busy}
          onChange={(defaultChartRange) => set({ defaultChartRange })}
        />
      </Field>

      <Field label="Opening tab" hint="Which pane you land on beside the watchlist.">
        <Choice
          value={prefs.defaultWorkTab}
          options={WORK_TABS}
          disabled={busy}
          onChange={(defaultWorkTab) => set({ defaultWorkTab })}
        />
      </Field>

      <Field
        label="Quote refresh"
        hint="How often watchlist prices re-fetch. Off saves requests on a slow connection."
      >
        <Choice
          value={prefs.quoteRefreshSeconds}
          options={QUOTE_REFRESH_CHOICES.map((s) => [s, refreshLabel(s)] as [number, string])}
          disabled={busy}
          onChange={(quoteRefreshSeconds) => set({ quoteRefreshSeconds })}
        />
      </Field>

      <Field
        label="All preferences"
        hint="Restores every setting on this page, including the alert defaults below."
      >
        <button type="button" className="btn" disabled={busy} onClick={() => reset.mutate()}>
          {reset.isPending ? "Restoring…" : "Restore defaults"}
        </button>
      </Field>

      {save.isError ? (
        <div className="form-error">{(save.error as Error).message}</div>
      ) : null}
    </>
  );
}

function AlertDefaults() {
  const { prefs } = usePreferences();
  const save = useSavePreferences();
  const busy = save.isPending;

  return (
    <>
      <Field
        label="Default baseline"
        hint="What a percentage rule measures against when you add one."
      >
        <Choice
          value={prefs.alertDefaultBaseline}
          options={BASELINES}
          disabled={busy}
          onChange={(alertDefaultBaseline) => save.mutate({ alertDefaultBaseline })}
        />
      </Field>

      <Field label="N-day window" hint="Days behind the high, when the baseline uses one.">
        <input
          type="number"
          min={1}
          max={365}
          className="setting-number"
          defaultValue={prefs.alertDefaultWindowDays}
          key={`w${prefs.alertDefaultWindowDays}`}
          disabled={busy}
          onBlur={(e) => {
            const alertDefaultWindowDays = Number(e.target.value);
            if (alertDefaultWindowDays !== prefs.alertDefaultWindowDays) {
              save.mutate({ alertDefaultWindowDays });
            }
          }}
        />
      </Field>

      <Field label="Cooldown" hint="Minutes a rule stays quiet after it fires.">
        <input
          type="number"
          min={0}
          max={1440}
          className="setting-number"
          defaultValue={prefs.alertDefaultCooldownMinutes}
          key={`c${prefs.alertDefaultCooldownMinutes}`}
          disabled={busy}
          onBlur={(e) => {
            const alertDefaultCooldownMinutes = Number(e.target.value);
            if (alertDefaultCooldownMinutes !== prefs.alertDefaultCooldownMinutes) {
              save.mutate({ alertDefaultCooldownMinutes });
            }
          }}
        />
      </Field>
    </>
  );
}

function IntelligenceSection() {
  const qc = useQueryClient();
  const { prefs } = usePreferences();
  const save = useSavePreferences();

  const chat = useQuery({
    queryKey: ["chat", "status"],
    queryFn: fetchChatStatus,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const wipe = useMutation({
    mutationFn: clearChat,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat"] }),
  });

  return (
    <>
      <Field
        label="Written rationales in the Hunt"
        hint="Off skips the model call and shows the scoring's own reason instead."
      >
        <Toggle
          checked={prefs.huntAiRationales}
          disabled={save.isPending}
          onChange={(huntAiRationales) => save.mutate({ huntAiRationales })}
        />
      </Field>

      <Field label="Assistant model" hint="Set on the deployment, not here.">
        <div className="setting-static">
          {chat.isPending
            ? "Checking…"
            : chat.data?.configured
              ? chat.data.provider
              : "No model configured"}
        </div>
      </Field>

      <Field label="Conversation" hint="Deletes every question and answer in the Ask panel.">
        <button
          type="button"
          className="btn"
          disabled={wipe.isPending}
          onClick={() => wipe.mutate()}
        >
          {wipe.isPending ? "Clearing…" : "Clear conversation"}
        </button>
      </Field>
    </>
  );
}

function DeliverySection({
  channels,
  loading,
  onToggle,
  onRemove,
}: {
  channels: NotificationChannel[];
  loading: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const watchlist = useQuery({ queryKey: ["watchlist", "server"], queryFn: fetchWatchlist });

  // Every stock you could set delivery up for: the watchlist, plus any name
  // that already has one, so an old channel never becomes unreachable.
  const symbols = useMemo(() => {
    const set = new Set<string>();
    for (const w of watchlist.data ?? []) set.add(w.symbol.toUpperCase());
    for (const c of channels) if (c.symbol) set.add(c.symbol.toUpperCase());
    return [...set].sort();
  }, [watchlist.data, channels]);

  const [symbol, setSymbol] = useState<string>("");
  const selected = symbol && symbols.includes(symbol) ? symbol : symbols[0] || "";

  if (!symbols.length) {
    return (
      <p className="muted">
        Add a stock to your watchlist first — a delivery belongs to a name.
      </p>
    );
  }

  return (
    <>
      <Field label="Set up delivery for" hint="Each stock has its own deliveries.">
        <select
          value={selected}
          onChange={(e) => setSymbol(e.target.value)}
          className="setting-select"
        >
          {symbols.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      {selected ? <SymbolChannels key={selected} symbol={selected} embedded /> : null}

      <h3 className="settings-sub">Everything set up</h3>
      <div className="card-list">
        {channels.map((ch) => (
          <div className="card" key={ch.id}>
            <div className="card-row">
              <div>
                <div className="settings-card-title">
                  {ch.symbol ? ch.symbol : <span className="muted">Unassigned</span>} · {ch.label}
                </div>
                <div className="muted">
                  <span className={`badge ${ch.enabled ? "badge-on" : ""}`}>{ch.type}</span>{" "}
                  {ch.type === "email" && String(ch.config.address || "")}
                  {ch.type === "telegram" && `chat ${String(ch.config.chatId || "")}`}
                  {ch.type === "twist" &&
                    `thread ${String(ch.config.conversationId || ch.config.threadId || "")}`}
                </div>
              </div>
              <div className="settings-card-actions">
                <button type="button" className="btn" onClick={() => onToggle(ch.id, !ch.enabled)}>
                  {ch.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => onRemove(ch.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
        {!channels.length && !loading && <div className="muted">No deliveries yet.</div>}
      </div>
    </>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();

  const alerts = useQuery({ queryKey: ["alerts"], queryFn: fetchAlerts });
  const events = useQuery({ queryKey: ["alert-events"], queryFn: fetchAlertEvents });
  const channels = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });
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
    <div className="page page-settings">
      <header className="settings-head">
        <h1>Settings</h1>
        <p className="page-lead">
          How the terminal behaves, and what it is connected to. Per-stock alerts and channels
          are set from the stock itself; what is here are the defaults they start from.
        </p>
      </header>

      <div className="settings-layout">
        <SettingsNav />

        <div className="settings-body">
          <Section id="account" title="Account">
            <AccountSection />
          </Section>

          <Section
            id="display"
            title="Display"
            lead="What the app shows you first, every time you open it."
          >
            <DisplaySection />
          </Section>

          <Section
            id="alerts"
            title="Notifications"
            lead="Rules decide when you hear about a stock and are set from its Notify me drawer. Deliveries decide where the message goes, and are set up here."
          >
            <AlertDefaults />

            <h3 className="settings-sub">Your rules</h3>
            <div className="card-list">
              {(alerts.data as AlertRule[] | undefined)?.map((rule) => (
                <div className="card" key={rule.id}>
                  <div className="card-row">
                    <div>
                      <div className="settings-card-title">
                        {rule.symbol} · {describeRule(rule)}
                        {rule.enabled ? "" : " · off"}
                      </div>
                      <div className="muted">{describeRuleDetail(rule)}</div>
                    </div>
                    <div className="settings-card-actions">
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
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {!alerts.data?.length && !alerts.isLoading && (
                <div className="muted">No alert rules yet.</div>
              )}
            </div>

            <h3 className="settings-sub">Delivery</h3>
            <DeliverySection
              channels={(channels.data as NotificationChannel[] | undefined) ?? []}
              loading={channels.isLoading}
              onToggle={(id, enabled) => updateChannelMut.mutate({ id, enabled })}
              onRemove={(id) => deleteChannelMut.mutate(id)}
            />

            <h3 className="settings-sub">Recent firings</h3>
            <div className="card-list">
              {(events.data as AlertEvent[] | undefined)?.slice(0, 10).map((ev) => (
                <div className="card" key={ev.id}>
                  <div className="settings-card-title">
                    {ev.symbol} · {fmtNum(ev.price)}
                  </div>
                  <div className="muted">
                    {ev.message} · {ev.status} · {formatDateTime(ev.createdAt)}
                  </div>
                </div>
              ))}
              {!events.data?.length && <div className="muted">No alerts have fired yet.</div>}
            </div>
          </Section>

          <Section
            id="intelligence"
            title="Intelligence"
            lead="What the scoring and the assistant are allowed to spend a model call on."
          >
            <IntelligenceSection />
          </Section>

          <Section id="data" title="Data" lead="Where your positions come from.">
            <FreetradeSection />
          </Section>

        </div>
      </div>
    </div>
  );
}
