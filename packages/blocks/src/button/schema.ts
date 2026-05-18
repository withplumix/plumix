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

  renderHTML({ node, HTMLAttributes }) {
    // `core/button` is `atom: true`, so the schema owns the visible
    // label rather than relying on inline content (which the parent
    // `<a>` couldn't carry anyway). The Frontend Component reads the
    // same `attrs.text` for SSR; we mirror it here so the editor
    // shows the button label instead of an empty link.
    return [
      "a",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "core/button" }),
      typeof node.attrs.text === "string" ? node.attrs.text : "",
    ];
  },
});
