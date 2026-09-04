import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Convex writes its deployment URLs to the repo-root .env.local, so read env from there. */
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  server: {
    // Fail loudly instead of drifting to another port, which breaks the auth origin check.
    port: 5173,
    strictPort: true,
  },
});
