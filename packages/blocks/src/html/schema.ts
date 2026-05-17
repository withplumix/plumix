import { mergeAttributes, Node } from "@tiptap/core";

export const htmlSchema = Node.create({
  name: "core/html",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      html: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-plumix-block='core/html']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "core/html" }),
    ];
  },
});
