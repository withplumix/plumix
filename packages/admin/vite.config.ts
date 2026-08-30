import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import license from "rollup-plugin-license";
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

// Tailwind, tw-animate-css and the Geist faces reach `dist` as CSS and font
// files rather than JS modules, so the notice generator — which walks the JS
// graph — never attributes them. Geist is SIL OFL-1.1, whose notice must
// travel with the font files; the other two are MIT. All four are direct
// dependencies, so pnpm links them into this package's own node_modules.
function shipAssetLicenses(): Plugin {
  const packages = [
    "tailwindcss",
    "tw-animate-css",
    "@fontsource-variable/geist",
    "@fontsource-variable/geist-mono",
  ];
  return {
    name: "plumix:ship-asset-licenses",
    apply: "build",
    async generateBundle() {
      for (const pkg of packages) {
        const src = fileURLToPath(
          new URL(`./node_modules/${pkg}/LICENSE`, import.meta.url),
        );
        this.emitFile({
          type: "asset",
          fileName: `LICENSE-${pkg.split("/").pop()}.txt`,
          source: await readFile(src, "utf8"),
        });
      }
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
    shipAssetLicenses(),
    // Copyleft in a bundle we publish as MIT is a licensing conflict, not a
    // paperwork gap, so it fails the build. Source-copied code is invisible to
    // the bundler and lives in the root LICENSE instead.
    license({
      thirdParty: {
        allow: {
          test: "MIT OR MIT-0 OR ISC OR Apache-2.0 OR BSD-2-Clause OR BSD-3-Clause OR 0BSD OR CC0-1.0 OR Unlicense OR BlueOak-1.0.0 OR Zlib OR Python-2.0",
          failOnViolation: true,
          failOnUnlicensed: true,
        },
        output: "dist/THIRD-PARTY-NOTICES.txt",
      },
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
    // lingui declares babel as optional peers, and this workspace resolves two
    // babel majors, so pnpm materializes one @lingui/react per peer context.
    // Two copies mean two LinguiContexts and `useLingui()` reads a null one in
    // whichever chunk lost the race. Pin the bundle to a single copy.
    dedupe: ["@lingui/react", "@lingui/core"],
  },
}));
