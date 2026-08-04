import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AppShell } from "./components/AppShell";
import { authClient } from "./lib/auth";
import { clearGuestWatchlist, getGuestSymbols } from "./lib/guestWatchlist";
import { syncWatchlist } from "./lib/queries";
import { AlertsPage } from "./pages/AlertsPage";
import { ChannelsPage } from "./pages/ChannelsPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

function useSyncGuestWatchlist(userId: string | undefined) {
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || synced.current === userId) return;
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

  if (isPending) {
    return <div className="empty-state">Loading…</div>;
  }

  return (
    <AppShell user={session?.user ?? null}>
      <Outlet />
    </AppShell>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === "string" ? search.next : undefined,
  }),
  component: function LoginRoute() {
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

const alertsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/alerts",
  component: function AlertsGate() {
    return (
      <RequireAuth>
        <AlertsPage />
      </RequireAuth>
    );
  },
});

const channelsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/settings/channels",
  component: function ChannelsGate() {
    return (
      <RequireAuth>
        <ChannelsPage />
      </RequireAuth>
    );
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([indexRoute, alertsRoute, channelsRoute]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
