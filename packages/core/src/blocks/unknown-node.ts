import { Node } from "@tiptap/core";

/**
 * Absorbs unregistered block types so a plugin uninstall doesn't strip them;
 * they round-trip byte-identical and render again on reinstall.
 */
export const unknownBlockSchema = Node.create({
  name: "unknown",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      originalType: { default: "" },
      payload: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-plumix-block='unknown']" }];
  },

  renderHTML() {
    return ["div", { "data-plumix-block": "unknown" }];
  },
});
