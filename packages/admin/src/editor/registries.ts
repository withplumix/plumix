import { use } from "react";

import type { BlockRegistry, MarkRegistry } from "@plumix/blocks";
import {
  coreBlocks,
  coreMarks,
  mergeBlockRegistry,
  mergeMarkRegistry,
} from "@plumix/blocks";

/**
 * Admin-side static registries derived from `@plumix/blocks` core specs.
 *
 * Lazy singletons rather than module-level `await` — top-level await
 * forces every importer into an async module and propagates that
 * status through Vite/Rollup chunk graphs. The Promise is created on
 * first call; React 19's `use()` unwraps it ergonomically inside
 * components, and React's Suspense boundary handles the wait.
 *
 * Plugin contributions are NOT visible here yet — that needs an RPC
 * endpoint exposing the runtime registry to the admin bundle (tracked
 * in [project_blocks_marks_deferred] memory). Once that lands, swap
 * the inputs below and the slash menu / bubble menu pick up plugin
 * entries automatically.
 */
let blocksPromise: Promise<BlockRegistry> | undefined;
let marksPromise: Promise<MarkRegistry> | undefined;

function getBlocksPromise(): Promise<BlockRegistry> {
  blocksPromise ??= mergeBlockRegistry({
    core: coreBlocks,
    plugins: [],
    themeOverrides: {},
    themeId: null,
  });
  return blocksPromise;
}

function getMarksPromise(): Promise<MarkRegistry> {
  marksPromise ??= mergeMarkRegistry({
    core: coreMarks,
    plugins: [],
    themeOverrides: {},
    themeId: null,
  });
  return marksPromise;
}

export function useAdminBlockRegistry(): BlockRegistry {
  return use(getBlocksPromise());
}

export function useAdminMarkRegistry(): MarkRegistry {
  return use(getMarksPromise());
}
