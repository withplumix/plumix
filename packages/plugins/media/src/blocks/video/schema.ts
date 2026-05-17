import { mergeAttributes, Node } from "@tiptap/core";

export const videoSchema = Node.create({
  name: "media/video",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      mediaId: { default: null },
      src: { default: null },
      poster: { default: null },
      controls: { default: true },
      autoplay: { default: false },
      loop: { default: false },
      muted: { default: false },
      playsinline: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: "video[data-plumix-block='media/video']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "media/video" }),
    ];
  },
});
