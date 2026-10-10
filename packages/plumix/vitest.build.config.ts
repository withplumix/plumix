import { defineConfig } from "vitest/config";

import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

// Only `*.build.test.ts`, which inspect built artifacts; its turbo task pulls
// the build graph.
export default defineConfig({
  plugins: [plumixSourceResolver()],
  test: {
    include: ["src/**/*.build.test.{ts,tsx}"],
    // pnpm's bin shims set `NODE_PATH`, but `bun --bun` on the `.mjs` entry
    // has none, so the build may not lean on it.
    env: { NODE_PATH: "" },
  },
});
