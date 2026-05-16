import { mergeAttributes, Node } from "@tiptap/core";

/**
 * Tiptap node for `core/paragraph`.
 *
 * Schema name matches the spec name (the walker dispatches on
 * `node.type === registry-name`). Existing StarterKit-shaped content
 * with `type: "paragraph"` is mapped here via the spec's `legacyAliases`.
 */
export const paragraphSchema = Node.create({
  name: "core/paragraph",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "p" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes), 0];
  },
});
