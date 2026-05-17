import { mergeAttributes, Node } from "@tiptap/core";

export const detailsSchema = Node.create({
  name: "core/details",
  group: "block",
  content: "block*",
  defining: true,

  addAttributes() {
    return {
      summary: { default: "" },
      open: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: "details[data-plumix-block='core/details']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "details",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "core/details" }),
      0,
    ];
  },
});
