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
  content: "coreColumn+",
  defining: true,

  addAttributes() {
    return {
      // `data-ratio` is what the block's CSS module keys off to set
      // `grid-template-columns`. Without addAttributes the schema
      // wouldn't accept `ratio` from Inspector updateAttributes, and
      // the rendered DOM wouldn't carry the attribute the CSS reads.
      ratio: {
        default: "1:1",
        parseHTML: (el) => el.getAttribute("data-ratio") ?? "1:1",
        renderHTML: (attrs: { ratio?: string }) =>
          attrs.ratio ? { "data-ratio": attrs.ratio } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-plumix-block='core/columns']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/columns",
        class: "plumix-columns",
      }),
      0,
    ];
  },
});

export const columnSchema = Node.create({
  name: "core/column",
  group: "block coreColumn",
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
