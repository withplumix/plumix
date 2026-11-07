import type { ReactNode } from "react";

import type { BlockContext, BlockNode, BlockSpec } from "../blocks/index.js";
import { defineEvent, defineFilter } from "./define.js";

export interface BlockRenderInput {
  readonly node: BlockNode;
  readonly context: BlockContext;
}

export interface BlockLoaderFailure {
  readonly spec: BlockSpec;
  readonly node: BlockNode;
  readonly key: string;
  readonly error: unknown;
}

/** Core's events and filters about blocks. */
export const block = {
  /**
   * A block's loader rejected; the block renders its `errorFallback`. Fired
   * once per rejected loader.
   */
  loaderFailed: defineEvent<BlockLoaderFailure>("block:loaderFailed"),
  /**
   * A block's element before its wrapper. Runs mid-render, so a handler
   * returns the element rather than a promise.
   */
  beforeRender: defineFilter<ReactNode, BlockRenderInput>(
    "block:beforeRender",
    { sync: true },
  ),
  /** A block's element after its wrapper; sync like `beforeRender`. */
  afterRender: defineFilter<ReactNode, BlockRenderInput>("block:afterRender", {
    sync: true,
  }),
};
