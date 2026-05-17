import { mergeAttributes, Node } from "@tiptap/core";

export const fileSchema = Node.create({
  name: "media/file",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      mediaId: { default: null },
      href: { default: null },
      filename: { default: "" },
      size: { default: null },
      mime: { default: "" },
      thumbnail: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-plumix-block='media/file']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "media/file" }),
    ];
  },
});
