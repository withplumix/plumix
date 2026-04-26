// Builds the media plugin's admin chunk into the admin package's preview
// dist using the same alias seam plumix's vite plugin uses at consumer
// build time. This mirrors the runtime-proof fixture build script in
// admin/e2e — our e2e rig reuses admin's static dist + drops the plugin
// chunk into it, then mocks the RPC layer in the spec.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

import type { SharedAdminRuntimeSpecifier } from "@plumix/core";
import {
  adminRuntimeShimSlug,
  SHARED_ADMIN_RUNTIME_SPECIFIERS,
} from "@plumix/core";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "../../..");
const ADMIN_DIST = resolve(REPO_ROOT, "packages/admin/dist");
const PLUMIX_ADMIN_SRC = resolve(REPO_ROOT, "packages/plumix/src/admin");

const SHIM_PATHS = Object.fromEntries(
  Object.keys(SHARED_ADMIN_RUNTIME_SPECIFIERS).map((spec) => {
    const slug = adminRuntimeShimSlug(spec as SharedAdminRuntimeSpecifier);
    return [spec, resolve(PLUMIX_ADMIN_SRC, `${slug}.ts`)];
  }),
);

const pluginsOutDir = resolve(ADMIN_DIST, "plugins");
await mkdir(pluginsOutDir, { recursive: true });

await build({
  entryPoints: [resolve(PLUGIN_ROOT, "src/admin/index.tsx")],
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

// Patch admin's index.html so the browser loads the plugin chunk. The
// admin build doesn't know about plugins; the host site's vite plugin
// adds this tag at consumer build time. For the playground we inject it
// here.
const indexHtmlPath = resolve(ADMIN_DIST, "index.html");
let html = await readFile(indexHtmlPath, "utf8");
const tag = `<script type="module" data-plumix-media-e2e src="/_plumix/admin/plugins/site-bundle.js"></script>`;
if (!html.includes("data-plumix-media-e2e")) {
  html = html.replace("</body>", `${tag}\n</body>`);
  await writeFile(indexHtmlPath, html);
}

console.log("[media-e2e] media plugin chunk assembled + injected");
