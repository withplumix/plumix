import { createElement } from "react";
import { createRoot } from "react-dom/client";

import type { BlockNode, BlockRegistry } from "@plumix/blocks";
import { isEntryContent } from "@plumix/blocks";

import { EditorCanvas } from "./editor-canvas.js";

interface MountEditorOptions {
  readonly doc: Document;
  /** Registry the canvas renders with (core + plugin blocks). */
  readonly registry: BlockRegistry;
  /** Host (admin shell) origin, for bridge message pinning. */
  readonly origin: string;
}

/**
 * Mounts the editor canvas into the SSR-emitted `[data-plumix-content-root]`,
 * seeded from the embedded `[data-plumix-initial-tree]` so first paint matches
 * the server render. Returns a teardown, or null when the page is not an
 * editor page (no content root).
 */
export function mountEditorRuntime({
  doc,
  registry,
  origin,
}: MountEditorOptions): (() => void) | null {
  const root = doc.querySelector("[data-plumix-content-root]");
  if (!(root instanceof Element)) return null;

  const initialTree = readInitialTree(doc);
  const reactRoot = createRoot(root);
  reactRoot.render(
    createElement(EditorCanvas, { registry, origin, initialTree }),
  );
  return () => reactRoot.unmount();
}

function readInitialTree(doc: Document): readonly BlockNode[] {
  const script = doc.querySelector("[data-plumix-initial-tree]");
  if (!script?.textContent) return [];
  try {
    const parsed: unknown = JSON.parse(script.textContent);
    return isEntryContent(parsed) ? parsed.blocks : [];
  } catch {
    return [];
  }
}
