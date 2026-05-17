import { mergeAttributes, Node } from "@tiptap/core";

export const buttonsSchema = Node.create({
  name: "core/buttons",
  group: "block",
  // `coreButton+` rather than `block*` so the Tiptap schema rejects
  // non-button children at parse time. The slash-free group name is
  // required because ProseMirror's content-expression parser doesn't
  // accept `/` in identifiers — see registry.tiptap-name.test.ts.
  content: "coreButton+",
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
