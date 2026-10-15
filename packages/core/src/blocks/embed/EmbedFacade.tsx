"use client";

import type { CSSProperties, ReactElement } from "react";
import { useState } from "react";

import type { IslandProps } from "../island-props.js";
import { embedFrameAttributes } from "./frame-attrs.js";

interface EmbedFacadeProps {
  readonly src: string;
  readonly title: string;
  readonly loadLabel: string;
  readonly caption: string;
  readonly provider: string;
  readonly sandboxed: boolean;
  readonly aspect?: string;
  readonly height?: number;
  readonly allowFullscreen?: boolean;
}

/**
 * Renders no `<iframe>` on the server, so the visitor's browser makes no
 * third-party connection until the first click mounts it.
 */
export function EmbedFacade(
  props: IslandProps<EmbedFacadeProps>,
): ReactElement {
  const [loaded, setLoaded] = useState(false);
  const {
    src,
    title,
    loadLabel,
    caption,
    provider,
    sandboxed,
    aspect,
    height,
    allowFullscreen,
  } = props;

  // Iframes have no intrinsic size, so the box (aspect ratio for video,
  // fixed height for audio/code) lives on the wrapper and the facade or
  // iframe fills it.
  const box: CSSProperties = {
    width: "100%",
    ...(aspect ? { aspectRatio: aspect } : { height }),
  };

  return (
    <figure data-provider={provider}>
      {loaded ? (
        <div className="plumix-embed" style={box}>
          <iframe
            data-testid="embed-frame"
            src={src}
            title={title}
            loading="lazy"
            allowFullScreen={allowFullscreen === true}
            style={{ width: "100%", height: "100%", border: 0 }}
            {...embedFrameAttributes(sandboxed)}
          />
        </div>
      ) : (
        <button
          type="button"
          className="plumix-embed-facade"
          data-testid="embed-facade"
          aria-label={loadLabel}
          style={{ ...box, cursor: "pointer" }}
          onClick={() => {
            setLoaded(true);
          }}
        >
          <span className="plumix-embed-facade-play" aria-hidden="true" />
        </button>
      )}
      {caption.length > 0 ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
