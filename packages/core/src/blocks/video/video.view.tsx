import type { ReactElement } from "react";

import type { BlockViewProps } from "../render-block-tree.js";

export default function VideoView({
  attrs,
  blockProps,
}: BlockViewProps): ReactElement {
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
}
