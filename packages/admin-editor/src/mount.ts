import { createElement } from "react";
import { createRoot } from "react-dom/client";

import type {
  BlockNode,
  BlockRegistry,
  RenderEnv,
  ShortcodeRegistry,
} from "@plumix/core/blocks";
import { isEntryContent, parseRenderEnv } from "@plumix/core/blocks";

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

  const initialTree = readInitialTree(doc);
  const reactRoot = createRoot(root);
  reactRoot.render(
    createElement(EditorCanvas, {
      ...readRenderEnv(doc),
      registry,
      shortcodes,
      origin,
      initialTree,
    }),
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

// The SSR embeds what the canvas — a fresh React tree with no server context —
// would otherwise have to guess; `parseRenderEnv` says what and why.
function readRenderEnv(doc: Document): RenderEnv {
  return parseRenderEnv(
    doc.querySelector("[data-plumix-render-env]")?.textContent ?? "",
  );
}
