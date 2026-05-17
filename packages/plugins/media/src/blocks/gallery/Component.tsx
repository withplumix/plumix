import type { BlockProps } from "plumix/blocks";
import type { ReactElement } from "react";

function clampColumns(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 3;
  const truncated = Math.trunc(raw);
  if (truncated < 1) return 1;
  if (truncated > 8) return 8;
  return truncated;
}

function pickAspect(raw: unknown): string | undefined {
  // Accepts `n:m` ratio or `auto`. Mirrors the columns ratio regex.
  if (raw === "auto") return "auto";
  return typeof raw === "string" && /^[1-9]\d*:[1-9]\d*$/.test(raw)
    ? raw
    : undefined;
}

function normalizeGap(raw: unknown): string | undefined {
  if (typeof raw === "string" && raw.length > 0) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return `${raw}px`;
  return undefined;
}

export function GalleryComponent({
  attrs,
  children,
}: BlockProps): ReactElement {
  const columns = clampColumns(attrs.columns);
  const aspect = pickAspect(attrs.aspect);
  const gap = normalizeGap(attrs.gap);
  return (
    <div
      data-plumix-block="media/gallery"
      data-columns={columns}
      data-aspect={aspect}
      data-gap={gap}
    >
      {children}
    </div>
  );
}
