import { Node } from "@tiptap/core";

/**
 * Tiptap node that absorbs any block whose `type` isn't registered, so
 * a plugin uninstall (or a draft authored against a newer site)
 * doesn't strip the block from the saved document. The unknown block
 * round-trips byte-identical through the editor and re-renders when
 * the plugin is reinstalled.
 *
 * `payload` is an opaque pass-through for the original attrs/content;
 * the walker writes it back verbatim on save.
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
