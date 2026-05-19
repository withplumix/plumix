export type StyleBucket = "small" | "medium" | "large";

const SMALL_MAX_PX = 640;
const MEDIUM_MAX_PX = 991;

export function viewportWidthToBucket(width: number | "100%"): StyleBucket {
  if (width === "100%") return "large";
  if (width <= SMALL_MAX_PX) return "small";
  if (width <= MEDIUM_MAX_PX) return "medium";
  return "large";
}
