import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./components/AppShell";
import { authClient } from "./lib/auth";
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

function AuthenticatedLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <div className="empty-state">Loading session…</div>;
  }

  if (!session?.user) {
    return <LoginPage />;
  }

  return (
    <AppShell user={session.user}>
      <Outlet />
    </AppShell>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: function LoginRoute() {
    const { data: session, isPending } = authClient.useSession();
    if (!isPending && session?.user) {
      window.location.href = "/";
      return null;
    }
    return <LoginPage />;
  },
});

const authedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authed",
  component: AuthenticatedLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/",
  component: HomePage,
});

const alertsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/alerts",
  component: AlertsPage,
});

const channelsRoute = createRoute({
  getParentRoute: () => authedRoute,
  path: "/settings/channels",
  component: ChannelsPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedRoute.addChildren([indexRoute, alertsRoute, channelsRoute]),
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
