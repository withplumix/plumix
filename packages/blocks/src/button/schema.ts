import { mergeAttributes, Node } from "@tiptap/core";

export const buttonSchema = Node.create({
  name: "core/button",
  // `coreButton` group is referenced by core/buttons's content
  // expression to enforce button-only children at the schema level.
  group: "block coreButton",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      href: { default: null },
      text: { default: "" },
      variant: { default: "primary" },
      size: { default: "md" },
      target: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-plumix-block='core/button']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "core/button" }),
    ];
  },
});
