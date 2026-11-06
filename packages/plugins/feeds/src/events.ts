import { defineFilter } from "plumix/plugin";

import type { FeedScope } from "./scope.js";
import type { FeedItem } from "./serialize.js";

/** The feeds plugin's filters, exported as `feed`. */
export const feed = {
  /**
   * A feed's item list before serialization: add, drop or re-order. The input
   * names the archive the items were collected for.
   */
  items: defineFilter<readonly FeedItem[], FeedScope>("feed:items", {
    sync: false,
  }),
};
