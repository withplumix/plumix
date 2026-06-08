import type { CSSProperties, ReactElement } from "react";
import { defineBlock } from "plumix/blocks";

import { resolveEmbed } from "./resolve.js";

export const embedBlock = defineBlock({
  name: "media/embed",
  title: "Embed",
  category: "media",
  description:
    "Embed a YouTube, Vimeo, Loom, Spotify, or CodePen URL — or any other " +
    "page in a sandboxed iframe.",
  keywords: ["iframe", "video", "youtube", "vimeo", "media"],
  inputs: [
    { name: "url", type: "url", label: "URL" },
    { name: "title", type: "text", label: "Accessible title" },
    { name: "caption", type: "text", label: "Caption" },
  ],
  defaults: { url: "", title: "", caption: "" },
  render: ({ attrs }): ReactElement | null => {
    const url = typeof attrs.url === "string" ? attrs.url : "";
    const resolved = resolveEmbed(url);
    if (!resolved) return null;

    const title =
      typeof attrs.title === "string" && attrs.title.length > 0
        ? attrs.title
        : "Embedded content";
    const caption = typeof attrs.caption === "string" ? attrs.caption : "";

    // Iframes have no intrinsic size, so the wrapper carries the box
    // (aspect ratio for video, fixed height for audio/code) and the
    // iframe fills it. Inlined so the block is self-contained without
    // requiring theme CSS.
    const wrapperStyle: CSSProperties = {
      width: "100%",
      ...(resolved.aspect
        ? { aspectRatio: resolved.aspect }
        : { height: resolved.height }),
    };

    return (
      <figure data-provider={resolved.provider}>
        <div className="plumix-embed" style={wrapperStyle}>
          <iframe
            src={resolved.src}
            title={title}
            loading="lazy"
            // Untrusted (non-safelist) URLs get a strict sandbox — notably
            // WITHOUT `allow-same-origin`, which combined with allow-scripts
            // lets a frame served from our origin strip its own sandbox — and
            // `no-referrer` so an author-chosen host never learns our origin.
            referrerPolicy={
              resolved.sandboxed
                ? "no-referrer"
                : "strict-origin-when-cross-origin"
            }
            allowFullScreen={resolved.allowFullscreen === true}
            style={{ width: "100%", height: "100%", border: 0 }}
            {...(resolved.sandboxed && { sandbox: "allow-scripts" })}
          />
        </div>
        {caption.length > 0 ? <figcaption>{caption}</figcaption> : null}
      </figure>
    );
  },
});
