import type { BlockNode } from "@plumix/blocks";

import type { EditorStoreApi } from "./store.js";
import { collectBlocks } from "./block-tree-ops.js";
import { parseClipboardBlocks, serializeBlocks } from "./clipboard.js";

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

/** Lowercased shortcut key → clipboard op (Cmd/Ctrl + c/x/v). */
export const CLIPBOARD_KEYS: Readonly<Record<string, ClipboardOp | undefined>> =
  { c: "copy", x: "cut", v: "paste" };

/**
 * Resolve a keydown to a block clipboard op, or `null` when it isn't one. Bails
 * on form fields / contenteditable (let them own their clipboard) and, for
 * copy/cut, on a real text selection (the author wants text, not a block). The
 * caller does preventDefault + performs the op — this is the shared decision the
 * host and the iframe both use, reading each context's own `window`.
 */
export function clipboardOpFromEvent(e: KeyboardEvent): ClipboardOp | null {
  if (!(e.metaKey || e.ctrlKey)) return null;
  const op = CLIPBOARD_KEYS[e.key.toLowerCase()];
  if (!op) return null;
  const target = e.target as HTMLElement | null;
  if (
    target?.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")
  ) {
    return null;
  }
  if (op !== "paste" && !(window.getSelection()?.isCollapsed ?? true)) {
    return null;
  }
  return op;
}

/**
 * Block clipboard operations over the editor store, async because the Clipboard
 * API is. `copy`/`cut` no-op when nothing is selected; `paste` no-ops when the
 * clipboard doesn't hold a plumix payload. `canPaste` filters pasted root nodes
 * (e.g. dropping `requiresParent` blocks, which can't live at the top level).
 */
export function createClipboardOps(
  store: EditorStoreApi,
  clipboard: ClipboardLike = navigator.clipboard,
  canPaste?: (node: BlockNode) => boolean,
): ClipboardOps {
  const copy = async (): Promise<boolean> => {
    const { tree, selectedIds } = store.getState();
    const blocks = collectBlocks(tree, selectedIds);
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
