import { mergeAttributes, Node } from "@tiptap/core";

export const imageSchema = Node.create({
  name: "media/image",
  group: "block mediaImage",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      // The media-row id this block references. The serve-route
      // resolves the id to a URL at SSR time; storing the id keeps
      // content portable across deploys / R2 buckets.
      mediaId: { default: null },
      src: { default: null },
      srcset: { default: null },
      alt: { default: "" },
      caption: { default: "" },
      sizing: { default: "full" },
      focalPoint: { default: { x: 0.5, y: 0.5 } },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-plumix-block='media/image']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "media/image" }),
    ];
  },
});
