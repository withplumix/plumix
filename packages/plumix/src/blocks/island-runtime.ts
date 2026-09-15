// Bridges the islands client runtime into the `plumix` package's
// public exports so consumer apps don't need a direct dep on the
// workspace-internal `@plumix/blocks`.
//
// `island-runtime.ts` runs `bootstrapIslandRuntime()` at module load
// (registers the custom element + strategies), which is all a page loads it
// for. The side-effect `import` keeps that through Rolldown's tree-shake. The
// entry republishes no value: the bootstrap is idempotent, so an importer has
// nothing left to call.

import "@plumix/blocks/island-runtime";
