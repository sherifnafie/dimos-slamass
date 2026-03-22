import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  appType: "spa",
  plugins: [react()],
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
  server: {
    /** Use hostname `localhost` so http://localhost:3001/ works (not IPv4-only 127.0.0.1). */
    host: "localhost",
    port: 3001,
    strictPort: true,
    open: false,
    /**
     * Fallback if you prefer same-origin `/api` (e.g. tools that cannot set CORS).
     * The React app uses `apiBase.ts` in dev to call `http://127.0.0.1:7780` directly so
     * EventSource (SSE) and POV/map images work reliably on http://localhost:3001/
     */
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7780",
        changeOrigin: true,
      },
    },
  },
});
