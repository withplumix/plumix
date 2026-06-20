import { coreBlocks, createBlockRegistry } from "@plumix/blocks";

import { resolveHostOrigin } from "./host-origin.js";
import { mountEditorRuntime } from "./mount.js";

/**
 * Boots the editor canvas in the iframe page. Called by the SSR-injected
 * editor entry. The registry is core-blocks only for now; plugin-block editing
 * is a follow-up (the registry-in-iframe problem). No-ops outside the browser.
 */
export function bootEditor(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  mountEditorRuntime({
    doc: document,
    registry: createBlockRegistry(coreBlocks),
    origin: resolveHostOrigin(window.location.search, window.location.origin),
  });
}
