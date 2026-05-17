import { mergeAttributes, Node } from "@tiptap/core";

export const separatorSchema = Node.create({
  name: "core/separator",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      variant: { default: "solid" },
    };
  },

  parseHTML() {
    return [{ tag: "hr[data-plumix-block='core/separator']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "hr",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/separator",
      }),
    ];
  },
});
