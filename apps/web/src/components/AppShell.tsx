import { Link, useRouterState } from "@tanstack/react-router";
import { authClient } from "../lib/auth";
import { AUTH_ENABLED } from "../lib/features";

type Props = {
  user: { name: string; email: string; image?: string | null } | null;
  children: React.ReactNode;
};

const NAV = [
  { to: "/", label: "Watchlist", match: (p: string) => p === "/" },
  {
    to: "/intelligence",
    label: "The Hunt",
    match: (p: string) => p.startsWith("/intelligence"),
  },
  {
    to: "/portfolio",
    label: "Paper",
    match: (p: string) => p.startsWith("/portfolio"),
  },
  {
    to: "/settings",
    label: "Settings",
    match: (p: string) => p.startsWith("/settings"),
  },
] as const;

export function AppShell({ user, children }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="app-shell app-shell-sidebar">
      <aside className="sidebar">
        <Link to="/" className="sidebar-brand">
          <img className="brand-mark" src="/favicon.svg" alt="" />
          <span>Trader</span>
        </Link>

        <nav className="sidebar-nav" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={item.match(pathname) ? "active" : ""}
            >
              <span className="sidebar-dot" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          {AUTH_ENABLED ? (
            user ? (
              <div className="sidebar-user">
                {user.image ? <img src={user.image} alt="" /> : <div className="sidebar-avatar" />}
                <div>
                  <div className="sidebar-user-name">{user.name || user.email}</div>
                  <div className="muted">Signed in</div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => authClient.signOut()}
                >
                  Out
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn btn-primary" search={{ next: pathname }}>
                Sign in
              </Link>
            )
          ) : (
            <div className="sidebar-user">
              <div className="sidebar-avatar" />
              <div>
                <div className="sidebar-user-name">Local trader</div>
                <div className="muted">Auth hidden</div>
              </div>
            </div>
          )}
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-search muted">Search stocks on Watchlist · The Hunt scores your list</div>
          <Link to="/settings" className="btn btn-ghost">
            Settings
          </Link>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
