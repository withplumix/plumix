// Builds the media plugin's admin chunk into the admin package's preview
// dist using the shared `buildAdminPluginChunkForE2E` helper. The script
// tag marker (`data-plumix-media-e2e`) keeps the media chunk distinct
// from any other plugin chunk that admin's own e2e tests might inject
// into the same dist.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildAdminPluginChunkForE2E } from "@plumix/core/test/playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "../../..");

await buildAdminPluginChunkForE2E({
  entryPoint: resolve(PLUGIN_ROOT, "src/admin/index.tsx"),
  adminDist: resolve(REPO_ROOT, "packages/admin/dist"),
  plumixAdminSrc: resolve(REPO_ROOT, "packages/plumix/src/admin"),
  scriptMarker: "data-plumix-media-e2e",
  logTag: "[media-e2e] media plugin chunk",
});
