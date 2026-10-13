import { createElement } from "react";
import { createRoot } from "react-dom/client";

import type { BlockRegistry, ShortcodeRegistry } from "@plumix/core/blocks";

import { parseCanvasSeed } from "./canvas-seed.js";
import { EditorCanvas } from "./editor-canvas.js";

interface MountEditorOptions {
  readonly doc: Document;
  readonly registry: BlockRegistry;
  readonly shortcodes?: ShortcodeRegistry;
  /** Host (admin shell) origin, for bridge message pinning. */
  readonly origin: string;
}

/** Returns null when the page has no `[data-plumix-content-root]`. */
export function mountEditorRuntime({
  doc,
  registry,
  shortcodes,
  origin,
}: MountEditorOptions): (() => void) | null {
  const root = doc.querySelector("[data-plumix-content-root]");
  if (!(root instanceof Element)) return null;

  const embed = (selector: string): string =>
    doc.querySelector(selector)?.textContent ?? "";
  // Read before React replaces the root's children, the embeds among them.
  const seed = parseCanvasSeed({
    initialTree: embed("[data-plumix-initial-tree]"),
    renderEnv: embed("[data-plumix-render-env]"),
    loaderData: embed("[data-plumix-loader-data]"),
  });
  const reactRoot = createRoot(root);
  reactRoot.render(
    createElement(EditorCanvas, { ...seed, registry, shortcodes, origin }),
  );
  return () => reactRoot.unmount();
}
