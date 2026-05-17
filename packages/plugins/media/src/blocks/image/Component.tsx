import type { BlockProps } from "plumix/blocks";
import type { ReactElement } from "react";

interface FocalPoint {
  readonly x: number;
  readonly y: number;
}

function normalizeFocalPoint(raw: unknown): FocalPoint | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { x, y } = raw as { x?: unknown; y?: unknown };
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return undefined;
  }
  return { x: clamp01(x), y: clamp01(y) };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

const SIZING = ["full", "wide", "narrow", "thumbnail"] as const;

function pickSizing(raw: unknown): (typeof SIZING)[number] | undefined {
  return typeof raw === "string" && (SIZING as readonly string[]).includes(raw)
    ? (raw as (typeof SIZING)[number])
    : undefined;
}

/**
 * `media/image` frontend Component.
 *
 * Emits `<figure><img><figcaption?></figure>`. The `src` is resolved by
 * the caller via the existing media serve route; `srcset` is left to
 * a theme wrapper or the image-delivery integration to override
 * (themes can replace this Component entirely via `defineTheme`).
 *
 * Focal point is encoded as `object-position: <x*100>% <y*100>%`
 * inline style so cropped variants align around the author-picked
 * focus.
 */
export function ImageComponent({ attrs }: BlockProps): ReactElement {
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
    <figure
      data-plumix-block="media/image"
      data-sizing={sizing}
      data-loading="lazy"
    >
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
}
