import { Link, useRouterState } from "@tanstack/react-router";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";

type Props = {
  user: { name: string; email: string; image?: string | null } | null;
  children: React.ReactNode;
};

export function AppShell({ user, children }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand" style={{ textDecoration: "none", color: "inherit" }}>
          <img className="brand-mark" src="/favicon.svg" alt="" />
          Trader
        </Link>
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
        {AUTH_ENABLED && (
          <div className="user-chip">
            {user ? (
              <>
                {user.image ? <img src={user.image} alt="" /> : null}
                <span>{user.name || user.email}</span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => authClient.signOut()}
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-primary" search={{ next: pathname }}>
                Sign in
              </Link>
            )}
          </div>
        )}
      </header>
      {children}
    </div>
  );
}
