import type { BlockNode, BlockSpec } from "@plumix/core/blocks";

/**
 * The loader never runs in this backend-less harness, so the host's refresh
 * stub pushes data in over the bridge.
 */
export const feedSpec: BlockSpec = {
  name: "playground/feed",
  inputs: [{ name: "title", type: "text", label: "Title" }],
  view: () => import("./feed-block.view.js"),
};

export const FEED_SEED: BlockNode = {
  id: "feed-1",
  name: "playground/feed",
  attrs: { title: "Latest posts" },
};
