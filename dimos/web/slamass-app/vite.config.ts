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
     * Dev default: UI uses same-origin `/api` (see `apiBase.ts`); Vite forwards to slamass on :7780
     * so fetch, SSE (`/api/events`), and map/POV images share the page origin.
     */
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7780",
        changeOrigin: true,
        ws: true,
        /** Long-lived SSE (`/api/events`) and large map PNGs */
        timeout: 600_000,
        proxyTimeout: 600_000,
      },
    },
  },
});
