import { Extension } from "@tiptap/core";

import { attachLongPressHandler } from "./long-press.js";

/**
 * Routes a long-press on the editor view to `openBlockMenuAtCaret`.
 * On touch devices the drag-handle plugin's hover model doesn't give
 * authors a discoverable way to surface block actions; long-press is
 * the canonical mobile gesture for "show contextual actions on this
 * thing." Desktop pointer interactions ignore touch events, so this
 * is a zero-cost addition outside the mobile path.
 */
export function createLongPressBlockMenuExtension(): Extension {
  return Extension.create({
    name: "plumixLongPressBlockMenu",
    addProseMirrorPlugins() {
      const { editor } = this;
      let detach: (() => void) | null = null;
      const attach = (): void => {
        if (detach) return;
        detach = attachLongPressHandler(editor.view.dom, () => {
          editor.commands.openBlockMenuAtCaret();
        });
      };
      editor.on("create", attach);
      // `create` may have already fired by the time addProseMirrorPlugins
      // returns when the editor is constructed synchronously (vitest);
      // attach immediately if the view is reachable. Tiptap v3 throws on
      // pre-mount view access — catch ONLY the view-access error so any
      // bug inside `attachLongPressHandler` still propagates.
      try {
        attach();
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes("editor view is not available")
        ) {
          throw error;
        }
      }
      editor.on("destroy", () => {
        detach?.();
        detach = null;
      });
      return [];
    },
  });
}
