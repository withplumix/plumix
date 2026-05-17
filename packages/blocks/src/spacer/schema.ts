import { mergeAttributes, Node } from "@tiptap/core";

export const spacerSchema = Node.create({
  name: "core/spacer",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      height: { default: 24 },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-plumix-block='core/spacer']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/spacer",
        "aria-hidden": "true",
      }),
    ];
  },
});
