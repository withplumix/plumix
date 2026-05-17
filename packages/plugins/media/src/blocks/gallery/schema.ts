import { mergeAttributes, Node } from "@tiptap/core";

export const gallerySchema = Node.create({
  name: "media/gallery",
  group: "block",
  // Children restricted to `media/image` at the schema level — the
  // Inspector's "add image" affordance is the only way authors compose
  // a gallery, and pasted content from other rich-text sources can't
  // smuggle non-image siblings into a gallery container.
  content: "mediaImage+",
  defining: true,

  addAttributes() {
    return {
      columns: { default: 3 },
      gap: { default: "0.5rem" },
      aspect: { default: "1:1" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-plumix-block='media/gallery']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "media/gallery" }),
      0,
    ];
  },
});
