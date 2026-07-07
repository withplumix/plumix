import type { ReactElement } from "react";

import { defineBlock } from "../block-registry.js";

export const videoBlock = defineBlock({
  name: "core/video",
  title: "Video",
  icon: "Video",
  category: "media",
  description: "HTML <video> with browser controls.",
  keywords: ["movie", "clip", "media"],
  // selfSeam so the block class + default sizing land on the `<video>` itself,
  // not a wrapper div.
  selfSeam: true,
  inputs: [
    { name: "src", type: "url", label: "Source URL" },
    { name: "poster", type: "url", label: "Poster image URL" },
    { name: "controls", type: "boolean", label: "Show controls" },
    { name: "autoplay", type: "boolean", label: "Autoplay" },
    { name: "loop", type: "boolean", label: "Loop" },
    { name: "muted", type: "boolean", label: "Muted" },
    { name: "playsinline", type: "boolean", label: "Plays inline (iOS)" },
  ],
  defaults: {
    src: "",
    poster: "",
    controls: true,
    autoplay: false,
    loop: false,
    muted: false,
    playsinline: true,
  },
  // A responsive video box — the browser's default <video> is a fixed 300x150.
  // Seeded as theme-overridable Styles values; `object-fit: contain` keeps a
  // non-16:9 video from stretching inside the box.
  defaultStyles: {
    large: {
      display: "block",
      width: "var(--plumix-video-width, 100%)",
      aspectRatio: "var(--plumix-video-aspect, 16 / 9)",
      objectFit: "contain",
      backgroundColor: "var(--plumix-video-bg, #000)",
      borderRadius: "var(--plumix-video-radius, 6px)",
    },
  },
  render: ({ attrs, blockProps }): ReactElement => {
    // Omit an empty src: `<video src="">` is invalid — the browser may try to
    // load the current page URL as the video, and it renders a broken player.
    const src =
      typeof attrs.src === "string" && attrs.src.length > 0
        ? attrs.src
        : undefined;
    const poster =
      typeof attrs.poster === "string" && attrs.poster.length > 0
        ? attrs.poster
        : undefined;
    return (
      <video
        {...blockProps}
        src={src}
        poster={poster}
        controls={attrs.controls !== false}
        autoPlay={attrs.autoplay === true}
        loop={attrs.loop === true}
        muted={attrs.muted === true}
        playsInline={attrs.playsinline !== false}
      />
    );
  },
});
