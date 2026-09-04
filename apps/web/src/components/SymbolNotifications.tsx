import { Link, useRouterState } from "@tanstack/react-router";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";
import { SymbolAlerts } from "./SymbolAlerts";

type Props = { symbol: string };

/**
 * Rules for one stock. Delivery is set up once in Settings and reused, so it
 * does not repeat itself in every stock's drawer — this surface only decides
 * when you hear about this name, not where the message goes.
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
          Sign in to be told when {symbol} moves.
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
        A rule decides <em>when</em> you hear about {symbol}. Where the message goes is set in{" "}
        <Link to="/settings">Settings</Link>.
      </p>

      <SymbolAlerts key={`al-${symbol}`} symbol={symbol} embedded />
    </div>
  );
}
