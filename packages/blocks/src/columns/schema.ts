import { mergeAttributes, Node } from "@tiptap/core";

/**
 * Tiptap node for `core/columns`.
 *
 * Children are typed `block*` in the Tiptap schema rather than
 * restricted to `core/column` — strict containment is an editor-surface
 * concern (slash menu allowedBlocks, drag-drop validation) handled in
 * the admin slice. Loose schema here keeps the parser tolerant of legacy
 * or hand-edited content.
 */
export const columnsSchema = Node.create({
  name: "core/columns",
  group: "block",
  content: "block*",
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-plumix-block='core/columns']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "core/columns" }),
      0,
    ];
  },
});

export const columnSchema = Node.create({
  name: "core/column",
  group: "block",
  content: "block*",
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-plumix-block='core/column']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "core/column" }),
      0,
    ];
  },
});
