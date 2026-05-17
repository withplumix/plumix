import { defineBlock } from "plumix/blocks";

export const videoBlock = defineBlock({
  name: "media/video",
  title: "Video",
  category: "media",
  description: "HTML <video> with browser controls.",
  keywords: ["movie", "clip", "media"],
  attributes: {
    mediaId: { type: "text", label: "Media id", default: "" },
    src: { type: "url", label: "Source URL", default: "" },
    poster: { type: "url", label: "Poster image URL", default: "" },
    controls: { type: "boolean", label: "Show controls", default: true },
    autoplay: { type: "boolean", label: "Autoplay", default: false },
    loop: { type: "boolean", label: "Loop", default: false },
    muted: { type: "boolean", label: "Muted", default: false },
    playsinline: {
      type: "boolean",
      label: "Plays inline (iOS)",
      default: true,
    },
  },
  supports: {
    spacing: { padding: true, margin: true },
    border: { radius: true },
    anchor: true,
    customClassName: true,
  },
  schema: () => import("./schema.js").then((m) => m.videoSchema),
  component: () => import("./Component.js").then((m) => m.VideoComponent),
});
