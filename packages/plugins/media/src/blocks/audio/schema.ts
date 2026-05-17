import { mergeAttributes, Node } from "@tiptap/core";

export const audioSchema = Node.create({
  name: "media/audio",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      mediaId: { default: null },
      src: { default: null },
      controls: { default: true },
      autoplay: { default: false },
      loop: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: "audio[data-plumix-block='media/audio']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "audio",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "media/audio" }),
    ];
  },
});
