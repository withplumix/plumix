import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

import type { SharedAdminRuntimeSpecifier } from "@plumix/core";
import {
  adminRuntimeShimSlug,
  SHARED_ADMIN_RUNTIME_SPECIFIERS,
} from "@plumix/core";

// Builds the runtime-proof fixture plugin into admin's preview dist
// using the same alias seam plumix's vite plugin uses at consumer
// build time. Hand-rolled here (instead of importing from `plumix`)
// so the admin package stays plumix-free — admin only needs `@plumix/
// core` for the shared-specifier contract and resolves the shims by
// relative path to `packages/plumix/src/admin/`.

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = resolve(HERE, "../..");
const ADMIN_DIST = resolve(ADMIN_ROOT, "dist");
const PLUMIX_ADMIN_SRC = resolve(ADMIN_ROOT, "../plumix/src/admin");

const SHIM_PATHS = Object.fromEntries(
  Object.keys(SHARED_ADMIN_RUNTIME_SPECIFIERS).map((spec) => {
    const slug = adminRuntimeShimSlug(spec as SharedAdminRuntimeSpecifier);
    return [spec, resolve(PLUMIX_ADMIN_SRC, `${slug}.ts`)];
  }),
);

const pluginsOutDir = resolve(ADMIN_DIST, "plugins");
await mkdir(pluginsOutDir, { recursive: true });

await build({
  entryPoints: [resolve(HERE, "runtime-proof-plugin/src/admin.ts")],
  outfile: resolve(pluginsOutDir, "site-bundle.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  legalComments: "none",
  logLevel: "warning",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "plumix:admin-runtime-alias",
      setup(buildApi) {
        buildApi.onResolve({ filter: /.*/ }, (args) => {
          const target = SHIM_PATHS[args.path];
          if (target === undefined) return null;
          return { path: target };
        });
      },
    },
  ],
});

const indexHtmlPath = resolve(ADMIN_DIST, "index.html");
let html = await readFile(indexHtmlPath, "utf8");
const tag = `<script type="module" data-plumix-e2e src="/_plumix/admin/plugins/site-bundle.js"></script>`;
if (!html.includes("data-plumix-e2e")) {
  html = html.replace("</body>", `${tag}\n</body>`);
  await writeFile(indexHtmlPath, html);
}

console.log("[e2e/runtime-proof] fixture plugin assembled + injected");
