import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { ADMIN_BASE_PATH } from "./src/lib/constants.js";

// `plumix dev` runs on Vite's default port 5173, so the admin moves to 5174
// to avoid a conflict. Admin proxies /_plumix/{rpc,auth} back to the worker
// so requests look same-origin from the browser. Override via
// PLUMIX_WORKER_URL when running the worker on a non-default host/port.
const ADMIN_DEV_PORT = 5174;
const WORKER_DEV_URL = process.env.PLUMIX_WORKER_URL ?? "http://localhost:5173";

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
    port: ADMIN_DEV_PORT,
    strictPort: true,
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
