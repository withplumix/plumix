import type { RegisteredMenuLocation } from "./types.js";

/** The deepest any menu nests, whatever its locations declare. */
export const MENU_DEPTH_HARD_CAP = 20;
const DEFAULT_MENU_DEPTH = 5;

export interface MenuDepthLimit {
  readonly maxDepth: number;
  /** The locations whose `maxDepth` sets the limit; empty for the default. */
  readonly limitedBy: readonly string[];
}

/** The smallest `maxDepth` among the locations a menu is assigned to. */
export function menuDepthLimit(
  assigned: readonly RegisteredMenuLocation[],
): MenuDepthLimit {
  let limit: MenuDepthLimit = { maxDepth: DEFAULT_MENU_DEPTH, limitedBy: [] };
  for (const location of assigned) {
    const { maxDepth } = location;
    if (maxDepth === undefined) continue;
    if (limit.limitedBy.length === 0 || maxDepth < limit.maxDepth) {
      limit = { maxDepth, limitedBy: [location.id] };
    } else if (maxDepth === limit.maxDepth) {
      limit = { maxDepth, limitedBy: [...limit.limitedBy, location.id] };
    }
  }
  return limit;
}
