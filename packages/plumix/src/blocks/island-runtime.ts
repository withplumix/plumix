// Bridges the islands client runtime into the `plumix` package's
// public exports so consumer apps don't need a direct dep on the
// workspace-internal `@plumix/blocks`.
//
// `island-runtime.ts` runs `bootstrapIslandRuntime()` at module load
// (registers the custom element + strategies). A bare `export *`
// re-export here would strip the side effect through Rolldown's
// tree-shake; the side-effect `import` below preserves it AND the
// named exports.

import "@plumix/blocks/island-runtime";

export * from "@plumix/blocks/island-runtime";
