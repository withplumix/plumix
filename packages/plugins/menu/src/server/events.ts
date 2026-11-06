import { defineEvent, defineFilter } from "plumix/plugin";

import type { ResolvedMenuItem } from "./types.js";

/**
 * The menu plugin's events and filters, exported as `menu` from `./server`
 * because the root's `menu()` factory already takes the name.
 */
export const menu = {
  /**
   * Runs once on a menu's top-level items after assembly. `location` is the
   * slot being rendered, or `null` when the menu was looked up by name.
   */
  tree: defineFilter<
    readonly ResolvedMenuItem[],
    { readonly location: string | null; readonly termId: number }
  >("menu:tree", { sync: false }),
  /**
   * Runs once for each resolved item, children first, so a handler sees the
   * item's subtree already filtered.
   */
  item: defineFilter<ResolvedMenuItem>("menu:item", { sync: false }),
  /**
   * A menu was saved, including a save that changed nothing. A handler that
   * throws does not undo the save.
   */
  saved: defineEvent<{
    readonly termId: number;
    readonly addedIds: readonly number[];
    readonly removedIds: readonly number[];
    readonly modifiedIds: readonly number[];
  }>("menu:saved"),
  /** A menu and its items were deleted. */
  deleted: defineEvent<{ readonly termId: number; readonly slug: string }>(
    "menu:deleted",
  ),
};
