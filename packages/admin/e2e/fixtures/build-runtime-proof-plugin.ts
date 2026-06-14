import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAdminPluginChunkForE2E } from "@plumix/core/test/playwright";

// Builds the runtime-proof fixture plugin into admin's preview dist
// using the same alias seam plumix's vite plugin uses at consumer
// build time. The shared helper in `@plumix/core/test/playwright`
// lives there (instead of in `plumix`) so the admin package stays
// plumix-free — admin only needs `@plumix/core` for the shared-
// specifier contract and resolves the shims by relative path to
// `packages/plumix/src/admin/`.

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN_ROOT = resolve(HERE, "../..");

await buildAdminPluginChunkForE2E({
  entryPoint: resolve(HERE, "runtime-proof-plugin/src/admin.ts"),
  adminDist: resolve(ADMIN_ROOT, "dist"),
  plumixAdminSrc: resolve(ADMIN_ROOT, "../plumix/src/admin"),
  scriptMarker: "data-plumix-e2e",
  logTag: "[e2e/runtime-proof] fixture plugin",
});

// The admin builds with a relative base (`./`) so the precompiled bundle is
// relocatable under a runtime basePath; production's `serveAdmin` injects a
// `<base href>` to anchor the relative asset URLs. `vite preview` doesn't, so
// SPA deep-link reloads (`/_plumix/admin/entries/posts/1/edit`) would resolve
// `./assets/*` against the wrong path and 404. Inject the same `<base href>`
// here so the preview mirrors the worker.
const indexHtmlPath = resolve(ADMIN_ROOT, "dist/index.html");
const indexHtml = readFileSync(indexHtmlPath, "utf8");
if (!indexHtml.includes("<base ")) {
  writeFileSync(
    indexHtmlPath,
    indexHtml.replace(/<head>/i, '<head><base href="/_plumix/admin/">'),
  );
}
