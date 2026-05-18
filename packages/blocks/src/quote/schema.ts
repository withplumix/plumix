import { mergeAttributes, Node } from "@tiptap/core";

export const quoteSchema = Node.create({
  name: "core/quote",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      citation: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "blockquote[data-plumix-block='core/quote']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "blockquote",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/quote",
        class: "plumix-quote",
      }),
      0,
    ];
  },
});
