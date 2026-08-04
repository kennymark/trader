import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { SymbolChannels } from "../components/SymbolChannels";
import { deleteChannel, fetchChannels, updateChannel } from "../lib/queries";
import { readSelectedSymbol } from "../lib/selectedSymbol";

export function ChannelsPage() {
  const qc = useQueryClient();
  const [selected] = useState(() => readSelectedSymbol());
  const channels = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { enabled?: boolean } }) =>
      updateChannel(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteChannel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });

  return (
    <div className="page">
      <h1>Notification channels</h1>
      <p className="page-lead">
        Overview of channels across all stocks. Primary management is on each stock&apos;s
        detail pane.
      </p>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        {selected ? (
          <SymbolChannels symbol={selected} />
        ) : (
          <div className="empty-state" style={{ padding: "2rem 1rem", height: "auto" }}>
            <strong>Select a stock</strong>
            <span>
              Open the{" "}
              <Link to="/" style={{ color: "var(--accent)" }}>
                watchlist
              </Link>{" "}
              and pick a symbol to add channels for that stock.
            </span>
          </div>
        )}
      </section>

      <h2 style={{ fontSize: "1.05rem" }}>All channels</h2>
      <div className="card-list">
        {(channels.data || []).map((ch) => (
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
                    updateMut.mutate({ id: ch.id, body: { enabled: !ch.enabled } })
                  }
                >
                  {ch.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => deleteMut.mutate(ch.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
        {!channels.data?.length && !channels.isLoading && (
          <div className="muted">No channels yet — add one from a stock&apos;s detail pane.</div>
        )}
      </div>
    </div>
  );
}
