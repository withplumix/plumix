import { createElement } from "react";
import { createRoot } from "react-dom/client";

import type { BlockRegistry, ShortcodeRegistry } from "@plumix/core/blocks";

import { parseCanvasSeed } from "./canvas-seed.js";
import { seedTree } from "./canvas-views.js";
import { EditorCanvas } from "./editor-canvas.js";

interface MountEditorOptions {
  readonly doc: Document;
  readonly registry: BlockRegistry;
  readonly shortcodes?: ShortcodeRegistry;
  /** Host (admin shell) origin, for bridge message pinning. */
  readonly origin: string;
}

/**
 * Resolves to null when the page has no `[data-plumix-content-root]`. The seed
 * tree's view modules load before the first render, so the canvas never shows a
 * loading state.
 */
export async function mountEditorRuntime({
  doc,
  registry,
  shortcodes,
  origin,
}: MountEditorOptions): Promise<(() => void) | null> {
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
  const initialTree = await seedTree(registry, seed.initialTree);
  const reactRoot = createRoot(root);
  reactRoot.render(
    createElement(EditorCanvas, {
      ...seed,
      initialTree,
      registry,
      shortcodes,
      origin,
    }),
  );
  return () => reactRoot.unmount();
}
