import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AlertRule, NotificationChannel } from "@trader/shared";
import {
  createChannel,
  deleteChannel,
  fetchChannels,
  linkTelegram,
  updateChannel,
} from "../lib/queries";
import { useConfirm } from "./ConfirmProvider";

type DraftType = "email" | "telegram" | "twist";

const TYPE_LABEL: Record<string, string> = {
  email: "Email",
  telegram: "Telegram",
  twist: "Twist",
};

/** The address, chat, or thread behind a destination — its real identity. */
function addressOf(channel: NotificationChannel): string {
  const config = channel.config;
  if (channel.type === "email") return String(config.address || "");
  if (channel.type === "telegram") return `chat ${String(config.chatId || "")}`;
  if (channel.type === "twist") {
    return `thread ${String(config.conversationId || config.threadId || "")}`;
  }
  return "";
}

/**
 * Every place alerts can reach you, for the whole account. A destination is
 * not per-stock: an inbox is the same inbox whatever the alert is about, and
 * which rules use it is decided on the rule.
 */
export function DeliveryDestinations({ rules }: { rules: AlertRule[] }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<DraftType | null>(null);
  const [emailAddress, setEmailAddress] = useState("");
  const [twistToken, setTwistToken] = useState("");
  const [twistThread, setTwistThread] = useState("");
  const [telegramLink, setTelegramLink] = useState<string | null>(null);

  const channels = useQuery({ queryKey: ["channels"], queryFn: fetchChannels });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["channels"] });
    qc.invalidateQueries({ queryKey: ["alerts"] });
  };

  const createMut = useMutation({
    mutationFn: createChannel,
    onSuccess: () => {
      invalidate();
      setDraft(null);
      setEmailAddress("");
      setTwistToken("");
      setTwistThread("");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateChannel(id, { enabled }),
    onSuccess: invalidate,
  });

  const deleteMut = useMutation({ mutationFn: deleteChannel, onSuccess: invalidate });

  const telegramMut = useMutation({
    mutationFn: linkTelegram,
    onSuccess: (data) => setTelegramLink(data.deepLink),
  });

  const list = channels.data ?? [];

  function rulesUsing(id: string) {
    return rules.filter((r) => r.channelIds.includes(id));
  }

  async function removeDestination(channel: NotificationChannel) {
    const using = rulesUsing(channel.id);
    const ok = await confirm({
      title: `Remove ${channel.label}?`,
      body:
        using.length === 0
          ? "No rule sends here, so nothing changes."
          : `${using.length} rule${using.length === 1 ? "" : "s"} send here and will stop. Their firings still land in the bell.`,
      confirmLabel: "Remove destination",
    });
    if (ok) deleteMut.mutate(channel.id);
  }

  return (
    <div className="delivery">
      <ul className="delivery-list">
        {list.map((channel) => {
          const address = addressOf(channel);
          const using = rulesUsing(channel.id).length;
          return (
            <li className="delivery-row" key={channel.id}>
              <div className="delivery-identity">
                <div className="delivery-name">{channel.label}</div>
                <div className="muted delivery-meta">
                  {TYPE_LABEL[channel.type] ?? channel.type}
                  {address && address !== channel.label ? ` · ${address}` : ""}
                  {" · "}
                  {using === 0
                    ? "no rules send here"
                    : `${using} rule${using === 1 ? "" : "s"} send here`}
                </div>
              </div>
              <div className="delivery-state">
                <span className={`delivery-status ${channel.enabled ? "is-on" : ""}`}>
                  {channel.enabled ? "On" : "Paused"}
                </span>
              </div>
              <div className="delivery-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => updateMut.mutate({ id: channel.id, enabled: !channel.enabled })}
                >
                  {channel.enabled ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => void removeDestination(channel)}
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
        {!channels.isLoading && !list.length ? (
          <li className="delivery-empty muted">
            Nothing beyond the app yet. Every firing lands in the bell; add a destination to be
            reached elsewhere too.
          </li>
        ) : null}
      </ul>

      <div className="delivery-add">
        <div className="stat-label">Add a destination</div>
        <div className="delivery-add-types" role="group" aria-label="Destination type">
          {(["email", "telegram", "twist"] as DraftType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={`btn ${draft === type ? "btn-primary" : ""}`}
              aria-pressed={draft === type}
              onClick={() => setDraft((v) => (v === type ? null : type))}
            >
              {TYPE_LABEL[type]}
            </button>
          ))}
        </div>

        {draft === "email" ? (
          <div className="delivery-form">
            <div className="field">
              <label htmlFor="delivery-email">Address</label>
              <input
                id="delivery-email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!emailAddress.trim() || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  type: "email",
                  config: { address: emailAddress.trim() },
                })
              }
            >
              Add email
            </button>
          </div>
        ) : null}

        {draft === "telegram" ? (
          <div className="delivery-form">
            <p className="muted delivery-form-lead">
              Generate a link, open it in Telegram, and tap Start. The chat is saved as a
              destination for every alert.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => telegramMut.mutate()}
              disabled={telegramMut.isPending}
            >
              Generate Telegram link
            </button>
            {telegramLink ? (
              <p className="delivery-form-lead">
                <a href={telegramLink} target="_blank" rel="noreferrer">
                  Open Telegram bot
                </a>
              </p>
            ) : null}
            {telegramMut.isError ? (
              <div className="form-error">{(telegramMut.error as Error).message}</div>
            ) : null}
          </div>
        ) : null}

        {draft === "twist" ? (
          <div className="delivery-form">
            <div className="field">
              <label htmlFor="delivery-twist-thread">Thread / conversation ID</label>
              <input
                id="delivery-twist-thread"
                value={twistThread}
                onChange={(e) => setTwistThread(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="delivery-twist-token">Access token</label>
              <input
                id="delivery-twist-token"
                value={twistToken}
                onChange={(e) => setTwistToken(e.target.value)}
                placeholder="Optional if TWIST_ACCESS_TOKEN is set"
              />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!twistThread.trim() || createMut.isPending}
              onClick={() =>
                createMut.mutate({
                  type: "twist",
                  config: {
                    accessToken: twistToken.trim() || undefined,
                    conversationId: twistThread.trim(),
                    threadId: twistThread.trim(),
                  },
                })
              }
            >
              Add Twist
            </button>
          </div>
        ) : null}

        {createMut.isError ? (
          <div className="form-error">{(createMut.error as Error).message}</div>
        ) : null}
      </div>
    </div>
  );
}
