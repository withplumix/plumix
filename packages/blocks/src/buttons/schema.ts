import { mergeAttributes, Node } from "@tiptap/core";

export const buttonsSchema = Node.create({
  name: "core/buttons",
  group: "block",
  content: "block*",
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-plumix-block='core/buttons']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "core/buttons" }),
      0,
    ];
  },
});
