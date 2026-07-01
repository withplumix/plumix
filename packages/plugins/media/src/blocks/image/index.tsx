import type { CSSProperties, ReactElement } from "react";
import { defineBlock } from "plumix/blocks";

import { normalizeFocalPoint } from "./normalize.js";

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
    { name: "sizes", type: "text", label: "Sizes" },
    { name: "alt", type: "text", label: "Alternative text" },
    { name: "caption", type: "text", label: "Caption" },
    // Display width edits the block's `style` slot, so it stays in sync with the
    // Styles tab's Size section (both write `node.style.width`).
    { name: "width", type: "text", label: "Width", styleProperty: "width" },
    {
      name: "priority",
      type: "checkbox",
      label: "High priority (load eagerly)",
    },
    { name: "focalPoint", type: "json", label: "Focal point" },
  ],
  defaults: {
    mediaId: "",
    src: "",
    srcset: "",
    sizes: "",
    alt: "",
    caption: "",
    priority: false,
    focalPoint: { x: 0.5, y: 0.5 },
  },
  render: ({ attrs, context }): ReactElement | null => {
    const src = typeof attrs.src === "string" ? attrs.src : "";
    const caption = typeof attrs.caption === "string" ? attrs.caption : "";

    // Empty source: show a placeholder in the editor so the block stays visible
    // and selectable; render nothing on the public page (an empty image block is
    // an unfinished draft, not content).
    if (src === "") {
      if (!context.editing) return null;
      return (
        <figure data-plumix-image-placeholder="" style={{ margin: 0 }}>
          <span data-plumix-image-placeholder-icon="" aria-hidden="true" />
          <span>No image</span>
        </figure>
      );
    }

    const alt = typeof attrs.alt === "string" ? attrs.alt : "";
    const srcset = typeof attrs.srcset === "string" ? attrs.srcset : undefined;
    const sizes = typeof attrs.sizes === "string" ? attrs.sizes : undefined;
    const priority = attrs.priority === true;
    const focal = normalizeFocalPoint(attrs.focalPoint);
    // The style-bound `width` lands on the block wrapper; the img caps to that
    // box (`display:block; max-width:100%`) so setting width constrains the
    // image down to the chosen width. `height:auto` holds aspect.
    const style: CSSProperties = {
      display: "block",
      maxWidth: "100%",
      height: "auto",
      ...(focal && {
        objectPosition: `${(focal.x * 100).toFixed(0)}% ${(focal.y * 100).toFixed(0)}%`,
      }),
    };
    return (
      <figure style={{ margin: 0 }}>
        <img
          src={src}
          srcSet={srcset}
          sizes={sizes}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          {...(priority && { fetchPriority: "high" as const })}
          style={style}
        />
        {caption.length > 0 ? <figcaption>{caption}</figcaption> : null}
      </figure>
    );
  },
});
