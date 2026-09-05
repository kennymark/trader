import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";
import { describeRule, describeRuleDetail, describeScope } from "../lib/alertText";
import { useConfirm } from "./ConfirmProvider";
import { RuleForm } from "./RuleForm";
import { deleteAlert, fetchAlerts, updateAlert } from "../lib/queries";

type Props = {
  symbol: string;
  /** Compact layout for embedding under the chart pane. */
  embedded?: boolean;
};

export function SymbolAlerts({ symbol, embedded = false }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthed = !AUTH_ENABLED || Boolean(session?.user);

  const alerts = useQuery({
    queryKey: ["alerts"],
    queryFn: fetchAlerts,
    enabled: isAuthed && !sessionPending,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => updateAlert(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const rules = alerts.data || [];
  const symbolRules = rules.filter(
    (r) => r.scope === "symbol" && r.symbol?.toUpperCase() === symbol.toUpperCase(),
  );
  // Rules that watch a whole scope cover this stock too, and saying so stops
  // the drawer implying nothing is watching when plenty is.
  const wideRules = rules.filter((r) => r.scope !== "symbol");

  return (
    <section className={embedded ? "symbol-alerts" : undefined}>
      <RuleForm scope="symbol" symbol={symbol} />

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
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Delete this rule?",
                      body: (
                        <>
                          {symbol} will stop alerting on “{describeRule(rule)}”. This cannot
                          be undone.
                        </>
                      ),
                      confirmLabel: "Delete rule",
                    });
                    if (ok) deleteMut.mutate(rule.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {!alerts.isLoading && !symbolRules.length && (
          <div className="muted">No rule watches {symbol} on its own yet.</div>
        )}
      </div>

      {wideRules.length ? (
        <>
          <h3 className="symbol-alerts-subtitle">Also watching {symbol}</h3>
          <div className="card-list">
            {wideRules.map((rule) => (
              <div className="card" key={rule.id}>
                <div style={{ fontWeight: 600 }}>
                  {describeScope(rule)} · {describeRule(rule)}
                  {!rule.enabled ? " · off" : ""}
                </div>
                <div className="muted">
                  {describeRuleDetail(rule)} · edit in <Link to="/settings">Settings</Link>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
