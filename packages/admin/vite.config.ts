import { fileURLToPath } from "node:url";
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
    // `@lingui/vite-plugin` compiles catalogs on-the-fly during dev and
    // emits per-locale chunks for prod. `@rolldown/plugin-babel` runs
    // Lingui's macro transform (`defineMessage`, `t`, `<Trans>`, etc.)
    // alongside plugin-react v6's OXC pipeline — v6 dropped its own
    // Babel hook, so this is the canonical path back. Both need an
    // explicit `cwd` so tools evaluating this config from the repo
    // root (knip) still find `packages/admin/lingui.config.ts`.
    lingui({ cwd: fileURLToPath(new URL(".", import.meta.url)) }),
    babel({
      presets: [
        linguiTransformerBabelPreset(undefined, {
          cwd: fileURLToPath(new URL(".", import.meta.url)),
        }),
      ],
    }),
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
});
