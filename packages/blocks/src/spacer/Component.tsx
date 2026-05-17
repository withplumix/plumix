import type { ReactElement } from "react";

import type { BlockProps } from "../types.js";

const DEFAULT_HEIGHT = 24;

function pickHeight(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_HEIGHT;
  }
  return raw;
}

export function SpacerComponent({ attrs }: BlockProps): ReactElement {
  const height = pickHeight(attrs.height);
  return (
    <div
      data-plumix-block="core/spacer"
      aria-hidden="true"
      style={{ height: `${height}px` }}
    />
  );
}
