import type { BlockProps } from "plumix/blocks";
import type { ReactElement } from "react";

export function VideoComponent({ attrs }: BlockProps): ReactElement {
  const src = typeof attrs.src === "string" ? attrs.src : "";
  const poster =
    typeof attrs.poster === "string" && attrs.poster.length > 0
      ? attrs.poster
      : undefined;
  return (
    <video
      data-plumix-block="media/video"
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
