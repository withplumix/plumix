import { mergeAttributes, Node } from "@tiptap/core";

/**
 * Description-list trio. Same slash-free-group trick as the list family:
 * the parent <dl>'s content expression references the `coreDescription`
 * group (no slash), and term + detail nodes declare that group on top
 * of `block`. Order is intentionally loose (`coreDescription+`) — HTML
 * allows multiple terms before a definition and any pairing; UI-side
 * authoring can layer stricter sequencing if a slice ever wants it.
 */

export const descriptionListSchema = Node.create({
  name: "core/description-list",
  group: "block",
  content: "coreDescription+",
  defining: true,

  parseHTML() {
    return [{ tag: "dl[data-plumix-block='core/description-list']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "dl",
      mergeAttributes(HTMLAttributes, {
        "data-plumix-block": "core/description-list",
      }),
      0,
    ];
  },
});

export const descriptionTermSchema = Node.create({
  name: "core/description-term",
  group: "coreDescription",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "dt" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["dt", mergeAttributes(HTMLAttributes), 0];
  },
});

export const descriptionDetailSchema = Node.create({
  name: "core/description-detail",
  group: "coreDescription",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "dd" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["dd", mergeAttributes(HTMLAttributes), 0];
  },
});
