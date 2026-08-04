import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  createChannel,
  deleteChannel,
  fetchChannels,
  linkTelegram,
  updateChannel,
} from "../lib/queries";
import { authClient } from "../lib/auth";

export function ChannelsPage() {
  const qc = useQueryClient();
  const { data: session } = authClient.useSession();
  const channels = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });

  const [emailLabel, setEmailLabel] = useState("Email alerts");
  const [emailAddress, setEmailAddress] = useState(session?.user?.email || "");
  const [twistLabel, setTwistLabel] = useState("Twist");
  const [twistToken, setTwistToken] = useState("");
  const [twistThread, setTwistThread] = useState("");
  const [telegramLink, setTelegramLink] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: createChannel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
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
    mutationFn: linkTelegram,
    onSuccess: (data) => setTelegramLink(data.deepLink),
  });

  return (
    <div className="page">
      <h1>Notification channels</h1>
      <p className="page-lead">
        Connect email, Telegram, and Twist. Alerts fan out to every channel you attach to a
        rule.
      </p>

      <div className="card-list" style={{ marginBottom: "2rem" }}>
        {(channels.data || []).map((ch) => (
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
                  onClick={() => deleteMut.mutate(ch.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
        {!channels.data?.length && !channels.isLoading && (
          <div className="muted">No channels yet — add one below.</div>
        )}
      </div>

      <section className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Email</h2>
        <div className="form-grid">
          <div className="field">
            <label>Label</label>
            <input value={emailLabel} onChange={(e) => setEmailLabel(e.target.value)} />
          </div>
          <div className="field">
            <label>Address</label>
            <input
              value={emailAddress}
              onChange={(e) => setEmailAddress(e.target.value)}
              placeholder={session?.user?.email || "you@example.com"}
            />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            createMut.mutate({
              type: "email",
              label: emailLabel,
              config: { address: emailAddress || session?.user?.email },
            })
          }
        >
          Add email channel
        </button>
      </section>

      <section className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Telegram</h2>
        <p className="muted">
          Generate a link, open it in Telegram, and tap Start. Your chat ID will be saved
          automatically.
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
          <p style={{ marginTop: "0.75rem" }}>
            <a href={telegramLink} target="_blank" rel="noreferrer">
              Open Telegram bot
            </a>
          </p>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: "1.05rem" }}>Twist</h2>
        <div className="form-grid">
          <div className="field">
            <label>Label</label>
            <input value={twistLabel} onChange={(e) => setTwistLabel(e.target.value)} />
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
            <input value={twistThread} onChange={(e) => setTwistThread(e.target.value)} />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            createMut.mutate({
              type: "twist",
              label: twistLabel,
              config: {
                accessToken: twistToken || undefined,
                conversationId: twistThread,
                threadId: twistThread,
              },
            })
          }
        >
          Add Twist channel
        </button>
      </section>

      {createMut.isError && (
        <div className="error-banner" style={{ marginTop: "1rem" }}>
          {(createMut.error as Error).message}
        </div>
      )}
    </div>
  );
}
