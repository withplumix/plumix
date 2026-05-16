import { mergeAttributes, Node } from "@tiptap/core";

/**
 * Tiptap node for `core/group` — a generic container that hosts any
 * block-level children. Inner-block restrictions (variations like Row /
 * Stack picked from the slash menu) live on the editor surface, not in
 * the schema, so a single Node definition serves all variants.
 */
export const groupSchema = Node.create({
  name: "core/group",
  group: "block",
  content: "block*",
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-plumix-block='core/group']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "core/group" }),
      0,
    ];
  },
});
