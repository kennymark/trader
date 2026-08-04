import { Link, useRouterState } from "@tanstack/react-router";
import { authClient } from "../lib/auth";

type Props = {
  user: { name: string; email: string; image?: string | null };
  children: React.ReactNode;
};

export function AppShell({ user, children }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/favicon.svg" alt="" />
          Trader
        </div>
        <nav className="nav-links">
          <Link to="/" className={pathname === "/" ? "active" : ""}>
            Watchlist
          </Link>
          <Link to="/alerts" className={pathname.startsWith("/alerts") ? "active" : ""}>
            Alerts
          </Link>
          <Link
            to="/settings/channels"
            className={pathname.startsWith("/settings") ? "active" : ""}
          >
            Channels
          </Link>
        </nav>
        <div className="user-chip">
          {user.image ? <img src={user.image} alt="" /> : null}
          <span>{user.name || user.email}</span>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => authClient.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      {children}
    </div>
  );
}
