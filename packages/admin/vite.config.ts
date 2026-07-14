import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { ADMIN_BASE_PATH } from "./src/lib/constants.js";

// `plumix dev` runs on Vite's default port 5173, so the admin moves to 5174
// to avoid a conflict. Admin proxies /_plumix/{rpc,auth} back to the plumix
// backend so requests look same-origin from the browser. Runtime-agnostic:
// whether the backend is a Cloudflare worker, a future Node/Bun adapter, or
// a remote instance, only the URL matters. Override via PLUMIX_BACKEND_URL.
const ADMIN_DEV_PORT = 5174;
const BACKEND_URL = process.env.PLUMIX_BACKEND_URL ?? "http://localhost:5173";

// Explicit cwd so tools evaluating this config from the repo root
// (knip) still find `packages/admin/lingui.config.ts`.
const PACKAGE_DIR = fileURLToPath(new URL(".", import.meta.url));

// globals.css inlines `theme.css` via `@import`, so nothing leaves a
// standalone copy in dist. Emit one for plumix's per-plugin sidecar to
// read from the installed package (see theme.css for who consumes it).
function shipThemeTokens(): Plugin {
  const src = fileURLToPath(new URL("./src/styles/theme.css", import.meta.url));
  return {
    name: "plumix:ship-theme-tokens",
    apply: "build",
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "theme.css",
        source: await readFile(src, "utf8"),
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  // A relative base makes the built bundle relocatable: the worker injects a
  // `<base href>` into the shell, so the same precompiled admin resolves its
  // assets at the root or under any subdirectory proxy without a rebuild. Dev
  // is served standalone, so it keeps the absolute mount path.
  base: command === "build" ? "./" : `${ADMIN_BASE_PATH}/`,
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
    lingui({ cwd: PACKAGE_DIR }),
    babel({
      presets: [linguiTransformerBabelPreset(undefined, { cwd: PACKAGE_DIR })],
    }),
    shipThemeTokens(),
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
}));
