import { Link, useRouterState } from "@tanstack/react-router";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";
import { SymbolAlerts } from "./SymbolAlerts";
import { SymbolChannels } from "./SymbolChannels";

type Props = { symbol: string };

/**
 * A rule and a channel are two halves of one sentence — notify me when X, via
 * Y — and neither is usable without the other. They were two drawers that
 * spent their copy pointing at each other; this is the one surface they were
 * always describing.
 */
export function SymbolNotifications({ symbol }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAuthed = !AUTH_ENABLED || Boolean(session?.user);

  if (AUTH_ENABLED && sessionPending) {
    return <div className="muted">Loading…</div>;
  }

  if (!isAuthed) {
    return (
      <div className="notify">
        <p className="notify-lead">
          Sign in to be told when {symbol} moves, and to choose where the message goes.
        </p>
        <Link to="/login" className="btn btn-primary" search={{ next: pathname }}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="notify">
      <p className="notify-lead">
        A rule decides <em>when</em> you hear about {symbol}. A delivery decides{" "}
        <em>where</em> the message arrives. A rule needs at least one.
      </p>

      <section className="notify-part">
        <h3 className="notify-part-title">Rules</h3>
        <SymbolAlerts key={`al-${symbol}`} symbol={symbol} embedded />
      </section>

      <section className="notify-part">
        <h3 className="notify-part-title">Delivery</h3>
        <p className="muted notify-part-lead">
          Email, Telegram, or Twist, attached to {symbol}. A rule can only notify a delivery
          listed here.
        </p>
        <SymbolChannels key={`ch-${symbol}`} symbol={symbol} embedded />
      </section>
    </div>
  );
}
