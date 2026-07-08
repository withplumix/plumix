import type { CSSProperties, ReactElement } from "react";
import { defineBlock } from "plumix/blocks";
import { Image } from "plumix/blocks/renderer";

import { normalizeFocalPoint } from "./normalize.js";

interface MediaValue {
  readonly url: string;
  readonly alt: string;
  readonly width: number | null;
  readonly height: number | null;
}

// The media picker writes a { id, url, alt, width, height } snapshot. Read just
// what render needs, tolerating a null/legacy value. A missing/null asset alt
// projects to "" here (the picker stores alt as string | null).
function normalizeMediaValue(raw: unknown): MediaValue | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.url !== "string" || obj.url === "") return null;
  return {
    url: obj.url,
    alt: typeof obj.alt === "string" ? obj.alt : "",
    width: typeof obj.width === "number" ? obj.width : null,
    height: typeof obj.height === "number" ? obj.height : null,
  };
}

export const imageBlock = defineBlock({
  name: "media/image",
  title: { id: "plugin.media.block.image.title", message: "Image" },
  icon: "Image",
  category: "media",
  description: {
    id: "plugin.media.block.image.description",
    message: "Image with alt text, caption, and focal-point cropping.",
  },
  keywords: [
    { id: "plugin.media.block.image.keyword.picture", message: "picture" },
    { id: "plugin.media.block.image.keyword.photo", message: "photo" },
    { id: "plugin.media.block.image.keyword.media", message: "media" },
  ],
  inputs: [
    // The picked library asset — a snapshot { id, url, alt, width, height }
    // written by the media picker. Render prefers it; `src` below is the escape
    // hatch for an unmanaged external URL.
    {
      name: "media",
      type: "media",
      label: {
        id: "plugin.media.block.image.input.media.label",
        message: "Image",
      },
      accept: "image/",
    },
    {
      name: "src",
      type: "url",
      label: {
        id: "plugin.media.block.image.input.src.label",
        message: "Source URL",
      },
    },
    {
      name: "alt",
      type: "text",
      label: {
        id: "plugin.media.block.image.input.alt.label",
        message: "Alternative text",
      },
    },
    {
      name: "caption",
      type: "text",
      label: {
        id: "plugin.media.block.image.input.caption.label",
        message: "Caption",
      },
    },
    {
      // An on/off setting → a Switch, consistent with the Styles tab's
      // visibility toggles (the repo's on/off convention).
      name: "priority",
      type: "boolean",
      label: {
        id: "plugin.media.block.image.input.priority.label",
        message: "High priority (load eagerly)",
      },
    },
    // A visual crop anchor: click/drag a dot on the image preview. `sizes` and
    // display `width` are deliberately not authored here — `sizes` is a
    // dev-only responsive hint the renderer defaults sensibly, and width lives
    // in the Styles tab's Size section (both would edit `node.style.width`).
    {
      name: "focalPoint",
      type: "focalPoint",
      label: {
        id: "plugin.media.block.image.input.focalPoint.label",
        message: "Focal point",
      },
    },
  ],
  defaults: {
    media: null,
    src: "",
    alt: "",
    caption: "",
    priority: false,
    focalPoint: { x: 0.5, y: 0.5 },
  },
  render: ({ attrs, context }): ReactElement | null => {
    // A picked library asset snapshots its url/alt; prefer it over the raw
    // `src` escape hatch so a managed image survives a stale typed URL.
    const media = normalizeMediaValue(attrs.media);
    const rawSrc = typeof attrs.src === "string" ? attrs.src : "";
    // `media.url` is guaranteed non-empty when present (normalizeMediaValue
    // drops a blank url), so ?? cleanly falls through to the raw src.
    const src = media?.url ?? rawSrc;
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

    // Block alt overrides the asset's alt; an empty block alt falls back to the
    // snapshot's (?? won't do this — "" is a set-but-empty override to skip).
    const blockAlt = typeof attrs.alt === "string" ? attrs.alt : "";
    const alt = blockAlt !== "" ? blockAlt : (media?.alt ?? "");
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
        {media?.width != null && media.height != null ? (
          // Managed image with intrinsic dimensions: the shared renderer builds
          // a responsive srcset (via the image-delivery transform) and emits
          // width/height to reserve layout space — no CLS.
          <Image
            src={src}
            alt={alt}
            width={media.width}
            height={media.height}
            sizes={sizes}
            priority={priority}
            style={style}
          />
        ) : (
          // Unmanaged/dimensionless source (external URL or SVG): render a plain
          // img — no srcset, no intrinsic dimensions to assume.
          <img
            src={src}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            decoding={priority ? "sync" : "async"}
            {...(priority && { fetchPriority: "high" as const })}
            style={style}
          />
        )}
        {caption.length > 0 ? <figcaption>{caption}</figcaption> : null}
      </figure>
    );
  },
});
