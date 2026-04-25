import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import {
  buildSharedRuntimeImportMap,
  SHARED_RUNTIME_SPECIFIERS,
} from "@plumix/core";

import { ADMIN_BASE_PATH } from "./src/lib/constants.js";
import { sharedRuntimeImportmap } from "./src/vite/shared-runtime-importmap.js";

// `plumix dev` runs on Vite's default port 5173, so the admin moves to 5174
// to avoid a conflict. Admin proxies /_plumix/{rpc,auth} back to the plumix
// backend so requests look same-origin from the browser. Runtime-agnostic:
// whether the backend is a Cloudflare worker, a future Node/Bun adapter, or
// a remote instance, only the URL matters. Override via PLUMIX_BACKEND_URL.
const ADMIN_DEV_PORT = 5174;
const BACKEND_URL = process.env.PLUMIX_BACKEND_URL ?? "http://localhost:5173";

const IMPORT_MAP = buildSharedRuntimeImportMap(ADMIN_BASE_PATH);

export default defineConfig(({ command }) => ({
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
    sharedRuntimeImportmap(IMPORT_MAP),
  ],
  server: {
    port: ADMIN_DEV_PORT,
    strictPort: true,
    proxy: {
      "/_plumix/rpc": { target: BACKEND_URL, changeOrigin: true },
      "/_plumix/auth": { target: BACKEND_URL, changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      // In production, treat shared-runtime specifiers as external —
      // they're resolved at runtime through the importmap to the
      // standalone vendor chunks built by `scripts/build-vendor-chunks.ts`.
      // The admin's main bundle and every plugin chunk consume the same
      // ESM modules, so React (and friends) instantiate exactly once.
      // In `vite dev` we keep them inlined for the usual fast HMR path.
      external: command === "build" ? [...SHARED_RUNTIME_SPECIFIERS] : [],
    },
  },
}));
