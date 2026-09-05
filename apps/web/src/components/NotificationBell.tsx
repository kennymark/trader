import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { AlertEvent, FeedItem } from "@trader/shared";
import { Drawer } from "./Drawer";
import { NotificationFeed } from "./NotificationFeed";
import { PredictionsPanel } from "./PredictionsPanel";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";
import { fetchAlertEvents, fetchIntelligence, fetchPredictions } from "../lib/queries";

const SEEN_KEY = "trader:feed-seen";
const SEEN_CAP = 300;
const ALERT_WINDOW_MS = 7 * 24 * 60 * 60_000;

/**
 * What counts as "the same notification" between visits. The scoring rebuilds
 * its items on every refresh with a fresh timestamp, so time alone would mark
 * everything new every five minutes; the call and its wording are what a
 * reader would actually notice changing.
 */
function fingerprint(item: FeedItem) {
  return `${item.id}|${item.action ?? ""}|${item.title}`;
}

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-SEEN_CAP)));
  } catch {
    // A blocked store only costs the badge, not the feed.
  }
}

/** A fired rule is the most literal notification there is; it leads the feed. */
function alertToFeedItem(event: AlertEvent): FeedItem {
  return {
    id: `alert-${event.id}`,
    kind: "alert",
    symbol: event.symbol,
    title: event.message,
    body:
      event.status === "failed"
        ? "Your rule fired, but none of its destinations could be reached."
        : event.status === "partial"
          ? "Your rule fired; one or more destinations could not be reached."
          : "Your rule fired.",
    score: 100,
    createdAt: event.createdAt,
    action: null,
    reasons: [],
    risk: null,
    confidence: null,
  };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(readSeen);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const signedOut = AUTH_ENABLED && !sessionPending && !session?.user;

  const hunt = useQuery({
    queryKey: ["intelligence", "watchlist"],
    queryFn: () => fetchIntelligence(),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const events = useQuery({
    queryKey: ["alert-events"],
    queryFn: fetchAlertEvents,
    enabled: !signedOut,
    staleTime: 60_000,
    retry: false,
  });

  // Only fetched once the drawer is open: the record is context for the calls,
  // not something the bell needs in order to count what is new.
  const predictions = useQuery({
    queryKey: ["predictions"],
    queryFn: fetchPredictions,
    enabled: open && !signedOut,
    staleTime: 60_000,
    retry: false,
  });

  const items = useMemo(() => {
    const cutoff = Date.now() - ALERT_WINDOW_MS;
    const fired = (events.data ?? [])
      .filter((e) => new Date(e.createdAt).getTime() >= cutoff)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(alertToFeedItem);
    return [...fired, ...(hunt.data?.feed ?? [])];
  }, [events.data, hunt.data]);

  const unread = items.filter((item) => !seen.has(fingerprint(item))).length;

  // Opening the drawer is the read receipt.
  useEffect(() => {
    if (!open || items.length === 0) return;
    const next = new Set(seen);
    let changed = false;
    for (const item of items) {
      const key = fingerprint(item);
      if (!next.has(key)) {
        next.add(key);
        changed = true;
      }
    }
    if (changed) {
      writeSeen(next);
      setSeen(next);
    }
  }, [open, items, seen]);

  return (
    <>
      <button
        type="button"
        className="notif-bell"
        aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M12 3a5.5 5.5 0 0 0-5.5 5.5v3.2L5 15.5h14l-1.5-3.8V8.5A5.5 5.5 0 0 0 12 3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M10 18a2 2 0 0 0 4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {unread > 0 ? (
          <span className="notif-dot" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      <Drawer
        open={open}
        title="Notifications"
        onClose={() => setOpen(false)}
        size="wide"
      >
        <div className="notif-drawer">
          {hunt.isPending && items.length === 0 ? (
            <p className="muted notif-drawer-state">Scoring your list…</p>
          ) : hunt.isError ? (
            <p className="muted notif-drawer-state">Couldn’t load the feed.</p>
          ) : (
            <NotificationFeed items={items} dashboard={predictions.data} />
          )}

          {predictions.data ? (
            <div className="notif-drawer-record">
              <PredictionsPanel data={predictions.data} />
            </div>
          ) : null}
        </div>
      </Drawer>
    </>
  );
}
