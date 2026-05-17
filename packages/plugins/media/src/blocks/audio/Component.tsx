import type { BlockProps } from "plumix/blocks";
import type { ReactElement } from "react";

export function AudioComponent({ attrs }: BlockProps): ReactElement {
  const src = typeof attrs.src === "string" ? attrs.src : "";
  return (
    <audio
      data-plumix-block="media/audio"
      src={src}
      controls={attrs.controls !== false}
      autoPlay={attrs.autoplay === true}
      loop={attrs.loop === true}
    />
  );
}
