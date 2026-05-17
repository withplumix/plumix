import { mergeAttributes, Node } from "@tiptap/core";

export const calloutSchema = Node.create({
  name: "core/callout",
  group: "block",
  content: "block*",
  defining: true,

  parseHTML() {
    return [{ tag: "aside[data-plumix-block='core/callout']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        role: "note",
        "data-plumix-block": "core/callout",
      }),
      0,
    ];
  },
});
