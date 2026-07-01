import type { ReactElement } from "react";

import { defineBlock } from "../block-registry.js";

export const videoBlock = defineBlock({
  name: "core/video",
  title: "Video",
  icon: "Video",
  category: "media",
  description: "HTML <video> with browser controls.",
  keywords: ["movie", "clip", "media"],
  inputs: [
    { name: "mediaId", type: "text", label: "Media id" },
    { name: "src", type: "url", label: "Source URL" },
    { name: "poster", type: "url", label: "Poster image URL" },
    { name: "controls", type: "boolean", label: "Show controls" },
    { name: "autoplay", type: "boolean", label: "Autoplay" },
    { name: "loop", type: "boolean", label: "Loop" },
    { name: "muted", type: "boolean", label: "Muted" },
    { name: "playsinline", type: "boolean", label: "Plays inline (iOS)" },
  ],
  defaults: {
    mediaId: "",
    src: "",
    poster: "",
    controls: true,
    autoplay: false,
    loop: false,
    muted: false,
    playsinline: true,
  },
  render: ({ attrs }): ReactElement => {
    const src = typeof attrs.src === "string" ? attrs.src : "";
    const poster =
      typeof attrs.poster === "string" && attrs.poster.length > 0
        ? attrs.poster
        : undefined;
    return (
      <video
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
