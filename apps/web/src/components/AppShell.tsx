import { Link, useRouterState } from "@tanstack/react-router";
import { authClient } from "../lib/auth";
import { SymbolSearch } from "./SymbolSearch";
import { NotificationBell } from "./NotificationBell";
import { ChatDock } from "./ChatDock";
import { CommandPalette } from "./CommandPalette";
import { AUTH_ENABLED } from "../lib/features";

type Props = {
  user: { name: string; email: string; image?: string | null } | null;
  children: React.ReactNode;
};

const NAV = [
  { to: "/", label: "Watchlist", match: (p: string) => p === "/" || p.startsWith("/intelligence") },
  {
    to: "/calendar",
    label: "Calendar",
    match: (p: string) => p.startsWith("/calendar"),
  },
  {
    to: "/portfolio",
    label: "Portfolio",
    match: (p: string) => p.startsWith("/portfolio"),
  },
  {
    to: "/settings",
    label: "Settings",
    match: (p: string) => p.startsWith("/settings"),
  },
] as const;

function NavIcon({ route }: { route: (typeof NAV)[number]["to"] }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (route === "/") {
    return (
      <svg {...common}>
        <path d="M4 18V9m5 9V5m5 13v-6m5 6V3" />
      </svg>
    );
  }
  if (route === "/calendar") {
    return (
      <svg {...common}>
        <path d="M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
        <path d="M8 13h3m2 0h3m-8 4h3" />
      </svg>
    );
  }
  if (route === "/portfolio") {
    return (
      <svg {...common}>
        <path d="M4 7h16v12H4zM8 7V5h8v2" />
        <path d="M4 11h16m-9 3h2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

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
              aria-current={item.match(pathname) ? "page" : undefined}
            >
              <NavIcon route={item.to} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          {AUTH_ENABLED ? (
            user ? (
              <div className="sidebar-user">
                {user.image ? <img src={user.image} alt="" /> : <div className="sidebar-avatar" />}
                {/* The name already says you are signed in. */}
                <div className="sidebar-user-name">{user.name || user.email}</div>
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
          <Link to="/" className="mobile-brand" aria-label="Trader home">
            <img className="brand-mark" src="/favicon.svg" alt="" />
          </Link>
          <SymbolSearch />
          <NotificationBell />
        </header>
        <main className="app-content">{children}</main>
      </div>

      <ChatDock />
      <CommandPalette />
    </div>
  );
}
