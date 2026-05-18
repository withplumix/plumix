import { mergeAttributes, Node } from "@tiptap/core";

// ProseMirror content expressions reject identifiers containing `/`,
// so list parents reference children via a slash-free group token
// (`coreListItem`) instead of the namespaced node name.
// See `registry.tiptap-name.test.ts` for the constraint probe.

export const listSchema = Node.create({
  name: "core/list",
  group: "block",
  content: "coreListItem+",
  defining: true,

  parseHTML() {
    return [{ tag: "ul[data-plumix-block='core/list']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "ul",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "core/list" }),
      0,
    ];
  },
});

export const listOrderedSchema = Node.create({
  name: "core/list-ordered",
  group: "block",
  content: "coreListItem+",
  defining: true,

  addAttributes() {
    return {
      // Render only when non-default — HTML treats `start` and the
      // boolean `reversed` based on attribute *presence*. Emitting
      // `reversed="false"` (the default) flips the browser into
      // reversed mode and produces `1, 0, -1, ...` numbering.
      start: {
        default: 1,
        renderHTML: (attrs: { start?: number }) =>
          typeof attrs.start === "number" && attrs.start !== 1
            ? { start: String(attrs.start) }
            : {},
      },
      reversed: {
        default: false,
        renderHTML: (attrs: { reversed?: boolean }) =>
          attrs.reversed === true ? { reversed: "" } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "ol[data-plumix-block='core/list-ordered']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "ol",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/list-ordered",
      }),
      0,
    ];
  },
});

export const listItemSchema = Node.create({
  name: "core/list-item",
  group: "coreListItem",
  // Paragraph wrapper is required by `splitListItem` — without it
  // the command's `grandParent.type !== type` guard short-circuits
  // and Enter never lifts the empty trailing item out of the list.
  content: "coreParagraph+",
  defining: true,

  // Enter on an empty list-item must escape the list rather than
  // splitting in place; `splitListItem` is the ProseMirror command
  // that handles both cases.
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => this.editor.commands.sinkListItem(this.name),
      "Shift-Tab": () => this.editor.commands.liftListItem(this.name),
    };
  },

  parseHTML() {
    return [{ tag: "li" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["li", mergeAttributes(HTMLAttributes), 0];
  },
});
