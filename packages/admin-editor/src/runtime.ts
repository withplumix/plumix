import type {
  BlockRegistry,
  BlockSpec,
  ShortcodeRegistry,
  ShortcodeSpec,
} from "@plumix/blocks";
import {
  coreBlocks,
  coreShortcodes,
  createBlockRegistry,
} from "@plumix/blocks";

import { resolveHostOrigin } from "./host-origin.js";
import { mountEditorRuntime } from "./mount.js";

/** Canvas registry = core baseline + the site's plugin block specs. Plugin
 *  specs win on a name collision (`createBlockRegistry` is last-write-wins). */
export function buildEditorRegistry(
  pluginBlocks: readonly BlockSpec[] = [],
): BlockRegistry {
  return createBlockRegistry([...coreBlocks, ...pluginBlocks]);
}

/** Canvas shortcodes = core baseline + the site's plugin then theme specs,
 *  last-write-wins — the `core < plugin < theme` precedence the server's
 *  registry gives, provided `specs` arrive plugin-first. */
export function buildEditorShortcodes(
  specs: readonly ShortcodeSpec[] = [],
): ShortcodeRegistry {
  return new Map([...coreShortcodes, ...specs].map((s) => [s.name, s]));
}

interface BootEditorOptions {
  /** Theme + plugin block specs. */
  readonly blocks?: readonly BlockSpec[];
  /** Plugin then theme shortcode specs. */
  readonly shortcodes?: readonly ShortcodeSpec[];
}

/**
 * Boots the editor canvas in the iframe page. Called by the SSR-injected
 * editor entry, which passes the site's theme + plugin block and shortcode
 * specs (recovered by the vite plugin from config source). No-ops outside the
 * browser.
 */
export function bootEditor({
  blocks,
  shortcodes,
}: BootEditorOptions = {}): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  mountEditorRuntime({
    doc: document,
    registry: buildEditorRegistry(blocks),
    shortcodes: buildEditorShortcodes(shortcodes),
    origin: resolveHostOrigin(window.location.search, window.location.origin),
  });
}
