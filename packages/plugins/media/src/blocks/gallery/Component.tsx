import type { BlockProps } from "plumix/blocks";
import type { ReactElement } from "react";

import { clampColumns, normalizeGap, pickAspect } from "./normalize.js";

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
