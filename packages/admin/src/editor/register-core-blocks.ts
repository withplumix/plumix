import { coreBlocks } from "@plumix/blocks";

import {
  getRegisteredBlocks,
  registerPluginBlock,
} from "../lib/plugin-registry.js";

// Idempotent against StrictMode + Vite HMR re-eval — guards via registry
// state, not a module-level boolean that decouples from the registry
// during a hot reload. Checks a core name specifically rather than a count:
// the plugin site-bundle can register many theme/plugin blocks before this
// runs, so a length threshold could false-positive and skip core entirely.
export function registerCoreBlocks(): void {
  const firstCoreName = coreBlocks[0]?.name;
  const registered = new Set(getRegisteredBlocks().map((b) => b.name));
  if (firstCoreName !== undefined && registered.has(firstCoreName)) return;
  for (const spec of coreBlocks) {
    registerPluginBlock(spec);
  }
}
