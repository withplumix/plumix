import type { BlockRegistry, BlockSpec } from "@plumix/blocks";
import { coreBlocks, createBlockRegistry } from "@plumix/blocks";

import { resolveHostOrigin } from "./host-origin.js";
import { mountEditorRuntime } from "./mount.js";

/** Canvas registry = core baseline + the site's plugin block specs. Plugin
 *  specs win on a name collision (`createBlockRegistry` is last-write-wins). */
export function buildEditorRegistry(
  pluginBlocks: readonly BlockSpec[] = [],
): BlockRegistry {
  return createBlockRegistry([...coreBlocks, ...pluginBlocks]);
}

/**
 * Boots the editor canvas in the iframe page. Called by the SSR-injected
 * editor entry, which passes the site's plugin block specs (collected by the
 * vite plugin from each plugin's `editorBlocksModule`). No-ops outside the
 * browser.
 */
export function bootEditor(pluginBlocks: readonly BlockSpec[] = []): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  mountEditorRuntime({
    doc: document,
    registry: buildEditorRegistry(pluginBlocks),
    origin: resolveHostOrigin(window.location.search, window.location.origin),
  });
}
