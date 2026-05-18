import { Extension } from "@tiptap/core";

export const BLOCK_MENU_OPEN_EVENT = "plumix:block-menu-open";

export interface BlockMenuOpenDetail {
  readonly pos: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    plumixBlockMenuKeyboard: {
      openBlockMenuAtCaret: () => ReturnType;
    };
  }
}

/**
 * Keyboard affordance for the BlockMenu. The drag-handle plugin from
 * `@tiptap/extension-drag-handle-react` only anchors on hover, which
 * leaves keyboard-only authors with no path to the block actions. This
 * extension bridges the caret position to React via a DOM custom event
 * so the listener (PlumixDragHandle) can open the menu against the
 * containing block — radix's Popover handles the rest.
 *
 * Mod-Alt-ArrowLeft was chosen for consistency with the #314 AC and
 * because no shipped block keyboard shortcut occupies it.
 */
export function createBlockMenuKeyboardExtension(): Extension {
  return Extension.create({
    name: "plumixBlockMenuKeyboard",
    addCommands() {
      return {
        openBlockMenuAtCaret:
          () =>
          ({ editor }) => {
            const { $from } = editor.state.selection;
            let depth = $from.depth;
            while (depth > 0 && !$from.node(depth).type.isBlock) depth -= 1;
            const pos = depth === 0 ? 0 : $from.before(depth);
            // Dispatch on `editor.view.dom` (per-editor) so two editor
            // mounts on one page don't crosstalk. The command only runs
            // after the editor is fully mounted, so `view` is safe.
            editor.view.dom.dispatchEvent(
              new CustomEvent(BLOCK_MENU_OPEN_EVENT, {
                detail: { pos } satisfies BlockMenuOpenDetail,
                bubbles: false,
              }),
            );
            return true;
          },
      };
    },
    addKeyboardShortcuts() {
      return {
        "Mod-Alt-ArrowLeft": () => this.editor.commands.openBlockMenuAtCaret(),
      };
    },
  });
}
