import { mergeAttributes, Node } from "@tiptap/core";

export const headingSchema = Node.create({
  name: "core/heading",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [
      { tag: "h1" },
      { tag: "h2" },
      { tag: "h3" },
      { tag: "h4" },
      { tag: "h5" },
      { tag: "h6" },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["h2", mergeAttributes(HTMLAttributes), 0];
  },
});
