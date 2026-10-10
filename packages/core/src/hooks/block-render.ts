import type { ReactNode } from "react";

import type { BlockContext, BlockNode, BlockSpec } from "../blocks/index.js";

export interface BlockRenderHookContext {
  readonly node: BlockNode;
  readonly context: BlockContext;
}

// Fired by the SSR dispatcher once per rejected loader. The hook is
// observational only (filters return `void`); plugins typically log to
// external observability and leave user-visible fallback to
// `BlockSpec.errorFallback`.
export interface BlockLoaderErrorContext {
  readonly spec: BlockSpec;
  readonly node: BlockNode;
  readonly key: string;
  readonly error: unknown;
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
    "blocks:loader:error": (result: void, ctx: BlockLoaderErrorContext) => void;
  }
}
