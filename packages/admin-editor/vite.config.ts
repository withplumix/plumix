import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standalone harness for the bespoke editor. The host page mounts PlumixEditor
// pointed at a same-origin canvas.html that renders EditorCanvas, so the whole
// editor UX runs with no worker, no orpc, no backend. tsc still owns the
// library build (tsconfig.build.json); this config is playground-only.
//
// `root` makes the build inputs + outDir relative to playground/. The dev
// server uses this port; e2e owns its preview port via an explicit --port flag
// (playwright.config.ts), so no preview port is baked here.
const PLAYGROUND = fileURLToPath(new URL("./playground", import.meta.url));
const PLAYGROUND_PORT = 5179;

export default defineConfig({
  root: PLAYGROUND,
  plugins: [tailwindcss(), react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { index: "index.html", canvas: "canvas.html" },
    },
  },
  server: { port: PLAYGROUND_PORT, strictPort: true },
});
