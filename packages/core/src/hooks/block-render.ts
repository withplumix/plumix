/**
 * Sync filter hooks fired by `renderBlockTree` around every block render.
 *
 * Plugins decorate or replace the React element the walker is about to
 * render: `block:before_render` runs first, `block:after_render` second,
 * with the second receiving the first's return value.
 *
 * Augments `FilterRegistry` so `setupContext.addFilter("block:before_render", ...)`
 * is type-safe at plugin-authoring time.
 */

import type { ReactNode } from "react";

import type { BlockContext, BlockNode } from "@plumix/blocks";

export interface BlockRenderHookContext {
  readonly node: BlockNode;
  readonly context: BlockContext;
}

declare module "./types.js" {
  interface FilterRegistry {
    "block:before_render": (
      element: ReactNode,
      ctx: BlockRenderHookContext,
    ) => ReactNode;
    "block:after_render": (
      element: ReactNode,
      ctx: BlockRenderHookContext,
    ) => ReactNode;
  }
}
