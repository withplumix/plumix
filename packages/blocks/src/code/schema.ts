import { mergeAttributes, Node } from "@tiptap/core";

export const codeSchema = Node.create({
  name: "core/code",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  defining: true,

  addAttributes() {
    return {
      language: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "pre[data-plumix-block='core/code']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "pre",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/code",
        class: "plumix-code",
      }),
      0,
    ];
  },
});
