import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, QueryErrorResetBoundary } from "@tanstack/react-query";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { convex } from "./lib/convex";
import { useEffect, useRef } from "react";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary, ErrorFallback } from "./components/ErrorBoundary";
import { authClient } from "./lib/auth";
import { AUTH_ENABLED } from "./lib/features";
import { clearGuestWatchlist, getGuestSymbols } from "./lib/guestWatchlist";
import { syncWatchlist } from "./lib/queries";
import { HomePage } from "./pages/HomePage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LoginPage } from "./pages/LoginPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      throwOnError: false,
    },
  },
});

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <QueryClientProvider client={queryClient}>
        <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary
            resetKeys={[pathname]}
            onReset={reset}
            title="App crashed"
            hint="A render error bubbled up. Try again — if it keeps happening, refresh the page."
          >
            <Outlet />
          </ErrorBoundary>
        )}
        </QueryErrorResetBoundary>
      </QueryClientProvider>
    </ConvexBetterAuthProvider>
  );
}

function useSyncGuestWatchlist(userId: string | undefined) {
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!AUTH_ENABLED || !userId || synced.current === userId) return;
    const symbols = getGuestSymbols();
    if (symbols.length === 0) {
      synced.current = userId;
      return;
    }
    synced.current = userId;
    syncWatchlist(symbols)
      .then(() => {
        clearGuestWatchlist();
        queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      })
      .catch(() => {
        synced.current = null;
      });
  }, [userId]);
}

function AppLayout() {
  const { data: session, isPending } = authClient.useSession();
  useSyncGuestWatchlist(session?.user?.id);

  if (AUTH_ENABLED && isPending) {
    return <div className="empty-state">Loading…</div>;
  }

  return (
    <AppShell user={AUTH_ENABLED ? session?.user ?? null : null}>
      <Outlet />
    </AppShell>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Auth UI hidden — allow all routes through for now.
  if (!AUTH_ENABLED) return children;

  if (isPending) {
    return <div className="empty-state">Loading…</div>;
  }

  if (!session?.user) {
    return (
      <div className="page">
        <h1>Sign in required</h1>
        <p className="page-lead">
          Create an account to save stocks, set alerts, and connect notification channels.
        </p>
        <Link to="/login" className="btn btn-primary" search={{ next: pathname }}>
          Sign in
        </Link>
      </div>
    );
  }

  return children;
}

const rootRoute = createRootRoute({
  component: RootLayout,
  errorComponent: function RouteError({ error, reset }) {
    const err = error instanceof Error ? error : new Error(String(error));
    return (
      <ErrorFallback
        error={err}
        reset={reset}
        title="This page failed to load"
        hint="The router hit an error while loading this route. Try again or go back home."
      />
    );
  },
  notFoundComponent: function NotFound() {
    return (
      <div className="error-boundary" role="status">
        <div className="error-boundary-card">
          <p className="error-boundary-kicker">404</p>
          <h1>Page not found</h1>
          <p className="error-boundary-hint">
            That route does not exist. Head back to your watchlist.
          </p>
          <div className="error-boundary-actions">
            <Link to="/" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Go home
            </Link>
          </div>
        </div>
      </div>
    );
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: function LoginRoute() {
    // Keep the route, but send people home while auth is hidden.
    if (!AUTH_ENABLED) {
      window.location.href = "/";
      return null;
    }
    const { data: session, isPending } = authClient.useSession();
    const { next } = loginRoute.useSearch();
    if (!isPending && session?.user) {
      window.location.href = next || "/";
      return null;
    }
    return <LoginPage next={next || "/"} />;
  },
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  component: HomePage,
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings",
  component: function SettingsGate() {
    return (
      <RequireAuth>
        <SettingsPage />
      </RequireAuth>
    );
  },
});

// The Hunt merged into the watchlist; keep the path working for old links.
const intelligenceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/intelligence",
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
});

const portfolioRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/portfolio",
  component: PortfolioPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([indexRoute, intelligenceRoute, portfolioRoute, settingsRoute]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultErrorComponent: function DefaultRouteError({ error, reset }) {
    const err = error instanceof Error ? error : new Error(String(error));
    return (
      <ErrorFallback
        error={err}
        reset={reset}
        title="Something went wrong"
        hint="This screen failed while loading. Try again or return home."
      />
    );
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
