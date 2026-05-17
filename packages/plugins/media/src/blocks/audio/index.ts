import { defineBlock } from "plumix/blocks";

export const audioBlock = defineBlock({
  name: "media/audio",
  title: "Audio",
  category: "media",
  description: "HTML <audio> with browser controls.",
  keywords: ["sound", "music", "podcast"],
  attributes: {
    mediaId: { type: "text", label: "Media id", default: "" },
    src: { type: "url", label: "Source URL", default: "" },
    controls: { type: "boolean", label: "Show controls", default: true },
    autoplay: { type: "boolean", label: "Autoplay", default: false },
    loop: { type: "boolean", label: "Loop", default: false },
  },
  supports: {
    spacing: { padding: true, margin: true },
    anchor: true,
    customClassName: true,
  },
  schema: () => import("./schema.js").then((m) => m.audioSchema),
  component: () => import("./Component.js").then((m) => m.AudioComponent),
});
