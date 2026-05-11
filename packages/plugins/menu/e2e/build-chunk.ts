import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAdminPluginChunkForE2E } from "plumix/test/playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "../../..");

await buildAdminPluginChunkForE2E({
  entryPoint: resolve(PLUGIN_ROOT, "src/admin/index.tsx"),
  adminDist: resolve(REPO_ROOT, "packages/admin/dist"),
  plumixAdminSrc: resolve(REPO_ROOT, "packages/plumix/src/admin"),
  scriptMarker: "data-plumix-menu-e2e",
  logTag: "[menu-e2e] menu plugin chunk",
});
