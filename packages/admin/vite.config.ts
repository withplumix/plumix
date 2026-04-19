import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { ADMIN_BASE_PATH } from "./src/lib/constants.js";

// In dev the admin runs on Vite (5173) while the worker runs on wrangler
// (8787 by default). Proxy /_plumix/* so RPC calls stay same-origin.
// Override via PLUMIX_WORKER_URL when running wrangler on a non-default port.
const WORKER_DEV_URL = process.env.PLUMIX_WORKER_URL ?? "http://localhost:8787";

export default defineConfig({
  base: `${ADMIN_BASE_PATH}/`,
  // tanstackRouter must run before @vitejs/plugin-react. quoteStyle +
  // semicolons keep routeTree.gen.ts prettier-clean across builds.
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      quoteStyle: "double",
      semicolons: true,
    }),
    tailwindcss(),
    react(),
  ],
  server: {
    proxy: {
      "/_plumix/rpc": { target: WORKER_DEV_URL, changeOrigin: true },
      "/_plumix/auth": { target: WORKER_DEV_URL, changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
