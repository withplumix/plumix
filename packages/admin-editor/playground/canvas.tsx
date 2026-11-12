import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import {
  coreBlocks,
  createBlockRegistry,
  loadBlockViews,
} from "@plumix/core/blocks";

import { treeBlockNames } from "../src/canvas-views.js";
import { EditorCanvas } from "../src/editor-canvas.js";
import { copySpec } from "./copy-block.js";
import { feedSpec } from "./feed-block.js";
import { searchSpec } from "./search-block.js";
import { SEED_BLOCKS } from "./seed.js";

import "./playground.css";

/**
 * Same-origin, so the postMessage bridge works for real without a worker or
 * public route.
 */
const registry = createBlockRegistry([
  ...coreBlocks,
  feedSpec,
  copySpec,
  searchSpec,
]);

// As `mountEditorRuntime` does: the seed's views load before the first render.
await loadBlockViews(registry, treeBlockNames(SEED_BLOCKS, registry));

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <EditorCanvas
        registry={registry}
        origin={window.location.origin}
        initialTree={SEED_BLOCKS}
      />
    </StrictMode>,
  );
}
