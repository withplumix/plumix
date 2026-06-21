import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { coreBlocks, createBlockRegistry } from "@plumix/blocks";

import { EditorCanvas } from "../src/editor-canvas.js";
import { SEED_BLOCKS } from "./seed.js";

import "./playground.css";

// The page the host iframe loads. Same-origin, so the postMessage bridge
// (handshake + host:tree / canvas:* reports) works for real — no worker, no
// public route. Mirrors what the SSR-injected editor runtime does in
// production, minus the server.
const registry = createBlockRegistry(coreBlocks);

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
