import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { coreBlocks, createBlockRegistry } from "@plumix/core/blocks";

import { EditorCanvas } from "../src/editor-canvas.js";
import { feedSpec } from "./feed-block.js";
import { SEED_BLOCKS } from "./seed.js";

import "./playground.css";

/**
 * Same-origin, so the postMessage bridge works for real without a worker or
 * public route.
 */
const registry = createBlockRegistry([...coreBlocks, feedSpec]);

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
