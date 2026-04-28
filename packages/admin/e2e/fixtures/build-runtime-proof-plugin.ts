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
