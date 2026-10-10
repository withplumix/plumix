import type { BlockNode, BlockRegistry } from "@plumix/core/blocks";

import type { EditorStoreApi } from "./store.js";
import { collectBlocks } from "./block-tree-ops.js";
import { parseClipboardBlocks, serializeBlocks } from "./clipboard.js";
import { isTypingTarget, matchesShortcut } from "./shortcuts.js";

/** Paste lands at the top level, where a `requiresParent` block can't live. */
export function pasteableAtRoot(
  registry: BlockRegistry,
): (node: BlockNode) => boolean {
  return (node) => !registry.get(node.name)?.requiresParent;
}

/** The subset of the Clipboard API the ops need — injectable for testing. */
export interface ClipboardLike {
  readText: () => Promise<string>;
  writeText: (text: string) => Promise<void>;
}

export type ClipboardOp = "copy" | "cut" | "paste";

export interface ClipboardOps {
  readonly copy: () => Promise<void>;
  readonly cut: () => Promise<void>;
  readonly paste: () => Promise<void>;
  readonly run: (op: ClipboardOp) => Promise<void>;
}

const CLIPBOARD_OPS = [
  "copy",
  "cut",
  "paste",
] as const satisfies readonly ClipboardOp[];

/**
 * `null` while typing, and for copy/cut on a real text selection. The caller
 * must preventDefault.
 */
export function clipboardOpFromEvent(e: KeyboardEvent): ClipboardOp | null {
  if (isTypingTarget(e.target)) return null;
  const op = CLIPBOARD_OPS.find((candidate) =>
    matchesShortcut(`clipboard.${candidate}`, e),
  );
  if (!op) return null;
  if (op !== "paste" && !(window.getSelection()?.isCollapsed ?? true)) {
    return null;
  }
  return op;
}

/** `paste` no-ops when the clipboard doesn't hold a plumix payload. */
export function createClipboardOps(
  store: EditorStoreApi,
  registry: BlockRegistry,
  clipboard: ClipboardLike = navigator.clipboard,
  canPaste?: (node: BlockNode) => boolean,
): ClipboardOps {
  const copy = async (): Promise<boolean> => {
    const { tree, selectedIds } = store.getState();
    const blocks = collectBlocks(tree, selectedIds, registry);
    if (blocks.length === 0) return false;
    await clipboard.writeText(serializeBlocks(blocks));
    return true;
  };

  const cut = async (): Promise<void> => {
    // Remove only after the write resolves, so a failed/denied write keeps the
    // blocks rather than losing them.
    if (await copy()) store.getState().removeSelected();
  };

  const paste = async (): Promise<void> => {
    const parsed = parseClipboardBlocks(await clipboard.readText());
    if (!parsed) return;
    const nodes = canPaste ? parsed.filter(canPaste) : parsed;
    if (nodes.length > 0) store.getState().pasteBlocks(nodes);
  };

  const run = (op: ClipboardOp): Promise<void> => {
    switch (op) {
      case "copy":
        return copy().then(() => undefined);
      case "cut":
        return cut();
      case "paste":
        return paste();
    }
  };

  return { copy: () => copy().then(() => undefined), cut, paste, run };
}
