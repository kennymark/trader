import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";
import {
  createChannel,
  deleteChannel,
  fetchChannels,
  linkTelegram,
  updateChannel,
} from "../lib/queries";
import { channelMatchesSymbol } from "../lib/channelSymbol";
import { useConfirm } from "./ConfirmProvider";

type Props = {
  symbol: string;
  embedded?: boolean;
};

export function SymbolChannels({ symbol, embedded = false }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthed = !AUTH_ENABLED || Boolean(session?.user);

  const [emailLabel, setEmailLabel] = useState(`Email · ${symbol}`);
  const [emailAddress, setEmailAddress] = useState("");
  const [twistLabel, setTwistLabel] = useState(`Twist · ${symbol}`);
  const [twistToken, setTwistToken] = useState("");
  const [twistThread, setTwistThread] = useState("");
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [draftChannel, setDraftChannel] = useState<"email" | "telegram" | "twist" | null>(
    null,
  );

  const channels = useQuery({
    queryKey: ["channels"],
    queryFn: fetchChannels,
    enabled: isAuthed && !sessionPending,
  });

  const createMut = useMutation({
    mutationFn: createChannel,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      setEmailAddress("");
      setTwistToken("");
      setTwistThread("");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { enabled?: boolean } }) =>
      updateChannel(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteChannel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });

  const telegramMut = useMutation({
    mutationFn: () => linkTelegram(symbol),
    onSuccess: (data) => setTelegramLink(data.deepLink),
  });

  const symbolChannels = (channels.data || []).filter((c) =>
    channelMatchesSymbol(c.symbol, symbol),
  );

  return (
    <section className={embedded ? "symbol-alerts" : undefined}>

      <div className="card-list" style={{ marginBottom: "1.25rem" }}>
        {symbolChannels.map((ch) => (
          <div className="card" key={ch.id}>
            <div className="card-row">
              <div>
                <div style={{ fontWeight: 600 }}>{ch.label}</div>
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
                  onClick={async () => {
                    const ok = await confirm({
                      title: `Remove ${ch.label}?`,
                      body: (
                        <>
                          Alerts on {symbol} that send here will have one less delivery, and
                          any rule left with none will stop reaching you.
                        </>
                      ),
                      confirmLabel: "Remove delivery",
                    });
                    if (ok) deleteMut.mutate(ch.id);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
        {!channels.isLoading && !symbolChannels.length && (
          <div className="muted">No channels for {symbol} yet.</div>
        )}
      </div>

      <div className="symbol-channel-forms">
        <div className="channel-draft-toggles" aria-label="Add a new channel">
          <button
            type="button"
            className={`btn ${draftChannel === "email" ? "btn-primary" : ""}`}
            aria-pressed={draftChannel === "email"}
            onClick={() =>
              setDraftChannel((v) => (v === "email" ? null : "email"))
            }
          >
            Email
          </button>
          <button
            type="button"
            className={`btn ${draftChannel === "telegram" ? "btn-primary" : ""}`}
            aria-pressed={draftChannel === "telegram"}
            onClick={() =>
              setDraftChannel((v) => (v === "telegram" ? null : "telegram"))
            }
          >
            Telegram
          </button>
          <button
            type="button"
            className={`btn ${draftChannel === "twist" ? "btn-primary" : ""}`}
            aria-pressed={draftChannel === "twist"}
            onClick={() =>
              setDraftChannel((v) => (v === "twist" ? null : "twist"))
            }
          >
            Twist
          </button>
        </div>

        {draftChannel === "email" && (
          <div className="card">
            <h3 className="symbol-alerts-subtitle" style={{ marginTop: 0 }}>
              Email
            </h3>
            <div className="form-grid">
              <div className="field">
                <label>Label</label>
                <input
                  value={emailLabel}
                  onChange={(e) => setEmailLabel(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Address</label>
                <input
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!emailAddress.trim() || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  type: "email",
                  label: emailLabel || `Email · ${symbol}`,
                  symbol,
                  config: { address: emailAddress.trim() },
                })
              }
            >
              Add email
            </button>
          </div>
        )}

        {draftChannel === "telegram" && (
          <div className="card">
            <h3 className="symbol-alerts-subtitle" style={{ marginTop: 0 }}>
              Telegram
            </h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Generate a link, open it in Telegram, and tap Start. The chat is saved for{" "}
              {symbol}.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => telegramMut.mutate()}
              disabled={telegramMut.isPending}
            >
              Generate Telegram link
            </button>
            {telegramLink && (
              <p style={{ marginTop: "0.75rem", marginBottom: 0 }}>
                <a href={telegramLink} target="_blank" rel="noreferrer">
                  Open Telegram bot
                </a>
              </p>
            )}
            {telegramMut.isError && (
              <div
                className="error-banner"
                style={{
                  marginTop: "0.75rem",
                  marginLeft: 0,
                  marginRight: 0,
                }}
              >
                {(telegramMut.error as Error).message}
              </div>
            )}
          </div>
        )}

        {draftChannel === "twist" && (
          <div className="card">
            <h3 className="symbol-alerts-subtitle" style={{ marginTop: 0 }}>
              Twist
            </h3>
            <div className="form-grid">
              <div className="field">
                <label>Label</label>
                <input
                  value={twistLabel}
                  onChange={(e) => setTwistLabel(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Access token</label>
                <input
                  value={twistToken}
                  onChange={(e) => setTwistToken(e.target.value)}
                  placeholder="Optional if TWIST_ACCESS_TOKEN set"
                />
              </div>
              <div className="field">
                <label>Thread / conversation ID</label>
                <input
                  value={twistThread}
                  onChange={(e) => setTwistThread(e.target.value)}
                />
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!twistThread.trim() || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  type: "twist",
                  label: twistLabel || `Twist · ${symbol}`,
                  symbol,
                  config: {
                    accessToken: twistToken || undefined,
                    conversationId: twistThread,
                    threadId: twistThread,
                  },
                })
              }
            >
              Add Twist
            </button>
          </div>
        )}
      </div>

      {createMut.isError && (
        <div className="error-banner" style={{ marginTop: "0.75rem", marginLeft: 0, marginRight: 0 }}>
          {(createMut.error as Error).message}
        </div>
      )}
    </section>
  );
}
