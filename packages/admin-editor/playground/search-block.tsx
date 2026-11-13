import type { BlockNode, BlockSpec } from "@plumix/core/blocks";

/** A theme's live form, which the canvas must keep from navigating the frame. */
export const searchSpec: BlockSpec = {
  name: "playground/search",
  view: () => import("./search-block.view.js"),
};

export const SEARCH_SEED: BlockNode = {
  id: "search-1",
  name: "playground/search",
};
