import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";
import { askChat, clearChat, fetchChatHistory, fetchChatStatus } from "../lib/queries";
import { Markdown } from "./Markdown";
import { useConfirm } from "./ConfirmProvider";

// A mix of both kinds, so it is visible that the assistant reads live market
// data as well as the book.
const PROMPTS = [
  "Which position has cost me the most?",
  "What is Moderna trading at right now?",
  "What is the biggest concentration in my book?",
  "When does Nvidia next report, and what is its forward P/E?",
];

/**
 * Asking the book a question. The model reads the same figures the screens
 * show, so an answer here and a number on the chart cannot disagree.
 */
export function PortfolioChat() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  // The assistant reads a book, and a guest has none, so it does not ask the
  // server anything until there is someone to answer about.
  const isAuthed = !AUTH_ENABLED || Boolean(session?.user);

  const status = useQuery({
    queryKey: ["chat", "status"],
    queryFn: fetchChatStatus,
    enabled: isAuthed,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const history = useQuery({
    queryKey: ["chat", "history"],
    queryFn: fetchChatHistory,
    enabled: isAuthed,
    retry: false,
  });

  const ask = useMutation({
    mutationFn: askChat,
    onSettled: () => qc.invalidateQueries({ queryKey: ["chat", "history"] }),
  });

  const wipe = useMutation({
    mutationFn: clearChat,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "history"] }),
  });

  const messages = history.data ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, ask.isPending]);

  function send(question: string) {
    const text = question.trim();
    if (!text || ask.isPending) return;
    setDraft("");
    ask.mutate(text);
  }

  if (AUTH_ENABLED && sessionPending) {
    return <p className="chat-notice">Loading…</p>;
  }

  if (!isAuthed) {
    return (
      <div className="chat-notice">
        <h3>Sign in to ask</h3>
        <p>
          The assistant answers from your own holdings, trades and watchlist, so it needs
          to know whose book it is reading.
        </p>
        <Link to="/login" search={{ next: "/" }} className="btn btn-primary">
          Sign in
        </Link>
      </div>
    );
  }

  if (status.isPending) {
    return <p className="chat-notice">Checking the model…</p>;
  }

  if (status.isError) {
    return <div className="chat-notice chat-error">{(status.error as Error).message}</div>;
  }

  if (!status.data?.configured) {
    return (
      <div className="chat-notice">
        <h3>No model configured</h3>
        <p>
          The assistant is wired up and knows how to read your book, but it has no model
          to think with yet. Set <code>ANTHROPIC_API_KEY</code> or{" "}
          <code>DEEPSEEK_API_KEY</code> on the Convex deployment and reload.
        </p>
        <p className="chat-notice-cmd">npx convex env set ANTHROPIC_API_KEY sk-ant-…</p>
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && !ask.isPending && (
          <div className="chat-opening">
            <p>
              {status.data.hasPortfolio
                ? "Ask about anything in your book — a position, a period, a decision you made — or about any listed company, which it will look up."
                : "No broker data imported yet, so questions about your own positions will be thin. Market questions work either way."}
            </p>
            <ul className="chat-prompts">
              {PROMPTS.map((p) => (
                <li key={p}>
                  <button type="button" onClick={() => send(p)}>
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`chat-turn chat-turn-${m.role}`}>
            <div className="chat-turn-who">{m.role === "user" ? "You" : m.provider || "Analyst"}</div>
            <div className="chat-turn-body">
              {m.role === "user" ? m.content : <Markdown>{m.content}</Markdown>}
            </div>
          </div>
        ))}

        {ask.isPending && (
          <div className="chat-turn chat-turn-assistant">
            <div className="chat-turn-who">{status.data.provider}</div>
            <div className="chat-turn-body chat-thinking">Reading your book…</div>
          </div>
        )}

        {ask.isError && (
          <div className="chat-error">{(ask.error as Error).message}</div>
        )}
      </div>

      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about your portfolio"
          aria-label="Ask about your portfolio"
          disabled={ask.isPending}
        />
        <button type="submit" className="btn btn-primary" disabled={ask.isPending || !draft.trim()}>
          Ask
        </button>
        {messages.length > 0 && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const ok = await confirm({
                title: "Clear this conversation?",
                body: `All ${messages.length} messages are deleted. This cannot be undone.`,
                confirmLabel: "Clear conversation",
              });
              if (ok) wipe.mutate();
            }}
            disabled={wipe.isPending}
          >
            Clear
          </button>
        )}
      </form>
    </div>
  );
}
