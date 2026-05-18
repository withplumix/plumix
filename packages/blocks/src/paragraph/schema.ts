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
  // `coreParagraph` is a slash-free alias so list-items can reference
  // paragraphs from their content expression (see list/schema.ts).
  group: "block coreParagraph",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "p" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/paragraph",
        class: "plumix-paragraph",
      }),
      0,
    ];
  },
});
