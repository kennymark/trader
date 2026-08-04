import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { router } from "./router";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary
      title="Trader failed to start"
      hint="A top-level error prevented the app from loading. Try refreshing the page."
    >
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
);
