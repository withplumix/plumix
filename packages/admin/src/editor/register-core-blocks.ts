import { coreBlocks } from "@plumix/blocks";

import {
  getRegisteredBlocks,
  registerPluginBlock,
} from "../lib/plugin-registry.js";

// Idempotent against StrictMode + Vite HMR re-eval — guards via registry
// state, not a module-level boolean that decouples from the registry
// during a hot reload.
export function registerCoreBlocks(): void {
  if (getRegisteredBlocks().length >= coreBlocks.length) return;
  for (const spec of coreBlocks) {
    registerPluginBlock(spec);
  }
}
