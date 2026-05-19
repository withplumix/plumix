import { VIEWPORT_MAX_PX } from "@plumix/blocks";

export type StyleBucket = "small" | "medium" | "large";

export function viewportWidthToBucket(width: number | "100%"): StyleBucket {
  if (width === "100%") return "large";
  if (width <= VIEWPORT_MAX_PX.small) return "small";
  if (width <= VIEWPORT_MAX_PX.medium) return "medium";
  return "large";
}
