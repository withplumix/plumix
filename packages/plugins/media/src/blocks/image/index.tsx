import type { ReactElement } from "react";
import { defineBlock } from "plumix/blocks";

import { normalizeFocalPoint, pickSizing } from "./normalize.js";

export const imageBlock = defineBlock({
  name: "media/image",
  title: "Image",
  icon: "Image",
  category: "media",
  description: "Image with alt text, caption, and focal-point cropping.",
  keywords: ["picture", "photo", "media"],
  inputs: [
    { name: "mediaId", type: "text", label: "Media id" },
    { name: "src", type: "url", label: "Source URL" },
    { name: "srcset", type: "text", label: "Source set" },
    { name: "alt", type: "text", label: "Alternative text" },
    { name: "caption", type: "text", label: "Caption" },
    {
      name: "sizing",
      type: "select",
      label: "Sizing",
      options: [
        { value: "full", label: "Full width" },
        { value: "wide", label: "Wide" },
        { value: "narrow", label: "Narrow" },
        { value: "thumbnail", label: "Thumbnail" },
      ],
    },
    { name: "focalPoint", type: "json", label: "Focal point" },
  ],
  defaults: {
    mediaId: "",
    src: "",
    srcset: "",
    alt: "",
    caption: "",
    sizing: "full",
    focalPoint: { x: 0.5, y: 0.5 },
  },
  render: ({ attrs }): ReactElement => {
    const src = typeof attrs.src === "string" ? attrs.src : "";
    const alt = typeof attrs.alt === "string" ? attrs.alt : "";
    const caption = typeof attrs.caption === "string" ? attrs.caption : "";
    const srcset = typeof attrs.srcset === "string" ? attrs.srcset : undefined;
    const sizing = pickSizing(attrs.sizing);
    const focal = normalizeFocalPoint(attrs.focalPoint);
    const objectPosition = focal
      ? `${(focal.x * 100).toFixed(0)}% ${(focal.y * 100).toFixed(0)}%`
      : undefined;
    return (
      <figure data-sizing={sizing} data-loading="lazy">
        <img
          src={src}
          srcSet={srcset}
          alt={alt}
          loading="lazy"
          decoding="async"
          {...(objectPosition && { style: { objectPosition } })}
        />
        {caption.length > 0 ? <figcaption>{caption}</figcaption> : null}
      </figure>
    );
  },
});
