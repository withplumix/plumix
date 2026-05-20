import type { ReactElement } from "react";
import { defineBlock } from "plumix/blocks";

export const audioBlock = defineBlock({
  name: "media/audio",
  title: "Audio",
  category: "media",
  description: "HTML <audio> with browser controls.",
  keywords: ["sound", "music", "podcast"],
  inputs: [
    { name: "mediaId", type: "text", label: "Media id" },
    { name: "src", type: "url", label: "Source URL" },
    { name: "controls", type: "boolean", label: "Show controls" },
    { name: "autoplay", type: "boolean", label: "Autoplay" },
    { name: "loop", type: "boolean", label: "Loop" },
  ],
  defaults: {
    mediaId: "",
    src: "",
    controls: true,
    autoplay: false,
    loop: false,
  },
  render: ({ attrs }): ReactElement => {
    const src = typeof attrs.src === "string" ? attrs.src : "";
    return (
      <audio
        src={src}
        controls={attrs.controls !== false}
        autoPlay={attrs.autoplay === true}
        loop={attrs.loop === true}
      />
    );
  },
});
