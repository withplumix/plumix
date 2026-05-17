import { mergeAttributes, Node } from "@tiptap/core";

/**
 * The list trio uses a camelCase group (`coreListItem`) rather than the
 * spec name directly in the parent's content expression. ProseMirror's
 * content-expression parser rejects identifiers with `/`, so we keep
 * the spec / Tiptap node name namespaced (`core/list-item`) but pin
 * containment via a slash-free group token. The probe in
 * `registry.tiptap-name.test.ts` documents the constraint.
 */

export const listSchema = Node.create({
  name: "core/list",
  group: "block",
  content: "coreListItem+",
  defining: true,

  parseHTML() {
    return [{ tag: "ul[data-plumix-block='core/list']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "ul",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "core/list" }),
      0,
    ];
  },
});

export const listOrderedSchema = Node.create({
  name: "core/list-ordered",
  group: "block",
  content: "coreListItem+",
  defining: true,

  addAttributes() {
    return {
      start: { default: 1 },
      reversed: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: "ol[data-plumix-block='core/list-ordered']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "ol",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/list-ordered",
      }),
      0,
    ];
  },
});

export const listItemSchema = Node.create({
  name: "core/list-item",
  group: "coreListItem",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "li" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["li", mergeAttributes(HTMLAttributes), 0];
  },
});
