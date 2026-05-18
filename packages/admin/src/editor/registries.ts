import { use } from "react";

import type { BlockRegistry, MarkRegistry } from "@plumix/blocks";
import {
  coreBlocks,
  coreMarks,
  mergeBlockRegistry,
  mergeMarkRegistry,
} from "@plumix/blocks";

import { readManifest } from "../lib/manifest.js";
import {
  getPluginBlockEditor,
  getPluginBlockSchema,
  getPluginMarkSchema,
} from "../lib/plugin-registry.js";
import {
  buildPluginBlockContributions,
  buildPluginMarkContributions,
} from "./plugin-contributions.js";

/**
 * Admin-side merged registries: core specs from `@plumix/blocks` plus
 * plugin contributions read out of the manifest and the runtime
 * `window.plumix.registerPluginBlock*` registrations the plugin admin
 * chunks ran at module-eval.
 *
 * Lazy singletons rather than module-level `await` — top-level await
 * forces every importer into an async module and propagates that
 * status through Vite/Rollup chunk graphs. The Promise is created on
 * first call; React 19's `use()` unwraps it ergonomically inside
 * components, and React's Suspense boundary handles the wait.
 */
let blocksPromise: Promise<BlockRegistry> | undefined;
let marksPromise: Promise<MarkRegistry> | undefined;

function getBlocksPromise(): Promise<BlockRegistry> {
  blocksPromise ??= (() => {
    const manifest = readManifest();
    const plugins = buildPluginBlockContributions(manifest.blocks ?? [], {
      getBlockSchema: getPluginBlockSchema,
      getBlockEditor: getPluginBlockEditor,
    });
    return mergeBlockRegistry({
      core: coreBlocks,
      plugins,
      themeOverrides: {},
      themeId: null,
    });
  })();
  return blocksPromise;
}

function getMarksPromise(): Promise<MarkRegistry> {
  marksPromise ??= (() => {
    const manifest = readManifest();
    const plugins = buildPluginMarkContributions(manifest.marks ?? [], {
      getMarkSchema: getPluginMarkSchema,
    });
    return mergeMarkRegistry({
      core: coreMarks,
      plugins,
      themeOverrides: {},
      themeId: null,
    });
  })();
  return marksPromise;
}

export function useAdminBlockRegistry(): BlockRegistry {
  return use(getBlocksPromise());
}

export function useAdminMarkRegistry(): MarkRegistry {
  return use(getMarksPromise());
}

/** @internal Test-only. Drops the memoised promises so the next call rebuilds. */
export function _resetAdminRegistries(): void {
  blocksPromise = undefined;
  marksPromise = undefined;
}
