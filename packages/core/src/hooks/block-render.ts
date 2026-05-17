/**
 * Sync filter hooks fired by `<EntryContent>` around every block render.
 *
 * Plugins decorate or replace the React element the walker is about to
 * render: `block:before_render` runs first, `block:after_render` second,
 * with the second receiving the first's return value. Both fire for the
 * unknown-block fallback too (so plugins can wrap unregistered content).
 *
 * Augments `FilterRegistry` so `setupContext.addFilter("block:before_render", ...)`
 * is type-safe at plugin-authoring time. The walker itself reads through a
 * structural `SyncFilterExecutor` in `@plumix/blocks` — that package has no
 * dependency on `@plumix/core`.
 */

import type { ReactNode } from "react";

import type { BlockContext, TiptapNode } from "@plumix/blocks";

export interface BlockRenderHookContext {
  readonly node: TiptapNode;
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
